from flask import Flask, jsonify, send_from_directory, request, send_file
import sqlite3
import subprocess
import signal
import os
import csv
import io
app = Flask(__name__)

# Serve HTML
@app.route('/')
def index():
    return send_from_directory('static', 'index.html')

# Helper: Get latest from sensor table
def get_latest_from_table(table_name):
    conn = sqlite3.connect('punch_data.db')
    c = conn.cursor()
    try:
        c.execute(f'''
            SELECT accel_x, accel_y, accel_z, gyro_x, gyro_y, gyro_z, timestamp
            FROM {table_name}
            ORDER BY id DESC
            LIMIT 1
        ''')
        row = c.fetchone()
        print(f"[✅] Latest from {table_name}: {row}")
    except sqlite3.Error as e:
        print(f"[❌] DB error from {table_name}: {e}")
        row = None
    finally:
        conn.close()

    if row:
        return {
            'accel': row[0:3],
            'gyro': row[3:6],
            'timestamp': row[6]
        }
    else:
        return {
            'accel': [0, 0, 0],
            'gyro': [0, 0, 0],
            'timestamp': None
        }

@app.route('/data/right')
def get_data_right():
    return jsonify(get_latest_from_table("device_right"))

@app.route('/data/left')
def get_data_left():
    return jsonify(get_latest_from_table("device_left"))

# Punch type (last punch)
@app.route('/last_punch')
def get_last_punch():
    conn = sqlite3.connect('punch_data.db')
    c = conn.cursor()
    try:
        c.execute('SELECT device_id, punch_type, timestamp FROM last_punch')
        data = c.fetchall()
        result = [
            {'device_id': row[0], 'punch_type': row[1], 'timestamp': row[2]}
            for row in data
        ]
    except sqlite3.Error as e:
        print(f"[❌] DB error last_punch: {e}")
        result = []
    finally:
        conn.close()
    return jsonify(result)

# Punch history (log)
@app.route('/punch_log')
def get_punch_log():
    limit = request.args.get('limit', default=20, type=int)
    conn = sqlite3.connect('punch_data.db')
    c = conn.cursor()
    try:
        c.execute('''
            SELECT device_id, punch_type, timestamp
            FROM punch_log
            ORDER BY id DESC
            LIMIT ?
        ''', (limit,))
        data = c.fetchall()
        result = [
            {'device_id': row[0], 'punch_type': row[1], 'timestamp': row[2]}
            for row in data
        ]
    except sqlite3.Error as e:
        print(f"[❌] DB error punch_log: {e}")
        result = []
    finally:
        conn.close()
    return jsonify(result)

# MQTT Control
mqtt_process = None

@app.route('/mqtt-control', methods=['POST'])
def mqtt_control():
    global mqtt_process
    data = request.get_json()
    status = data.get('status')

    if status == 'on':
        if mqtt_process is None:
            mqtt_process = subprocess.Popen(['python', 'raw_data_to_mqtt.py'])
            return jsonify({'message': 'MQTT script started'})
        else:
            return jsonify({'message': 'Script already running'})
    elif status == 'off':
        if mqtt_process:
            mqtt_process.terminate()
            mqtt_process = None
            return jsonify({'message': 'MQTT script terminated'})
        else:
            return jsonify({'message': 'No script to terminate'})
    else:
        return jsonify({'message': 'Invalid command'}), 400

@app.route('/download_csv')
def download_csv():
    # Koneksi ke SQLite
    conn = sqlite3.connect('punch_data.db')
    cursor = conn.cursor()

    # Ambil semua data dari punch_log
    cursor.execute("SELECT id, timestamp, device_id, punch_type FROM punch_log")
    rows = cursor.fetchall()

    # Buat CSV dalam memory (pakai StringIO supaya tidak perlu simpan file)
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Tulis header
    writer.writerow(['id', 'timestamp', 'device_id', 'punch_type'])
    
    # Tulis data
    writer.writerows(rows)

    # Kembali ke awal
    output.seek(0)

    # Kirim file ke user
    return send_file(
        io.BytesIO(output.getvalue().encode()),
        mimetype='text/csv',
        as_attachment=True,
        download_name='Riwayat_Aktivitas_Latihan.csv'
    )

if __name__ == '__main__':
    # Supaya mqtt_process tidak double start saat Flask reload otomatis
    app.run(debug=True, use_reloader=False)