import sqlite3
import ssl
import paho.mqtt.client as mqtt
from datetime import datetime
import signal
import sys

# Konfigurasi MQTT HiveMQ Cloud
MQTT_BROKER = "3e065ffaa6084b219bc6553c8659b067.s1.eu.hivemq.cloud"
MQTT_PORT = 8883
MQTT_USERNAME = "CapstoneUser"
MQTT_PASSWORD = "Mango!River_42Sun"
MQTT_TOPICS = [
    ("boxing/raw_data_right", 0),
    ("boxing/raw_data_left", 0),
    ("boxing/punch_type", 2)  # ← tambahan untuk punch_type
]

# Inisialisasi database
def init_db():
    conn = sqlite3.connect("punch_data.db")
    c = conn.cursor()
    
    # Tabel untuk data sensor
    for table in ["device_left", "device_right"]:
        c.execute(f'''
            CREATE TABLE IF NOT EXISTS {table} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT,
                device_id TEXT,
                accel_x REAL,
                accel_y REAL,
                accel_z REAL,
                gyro_x REAL,
                gyro_y REAL,
                gyro_z REAL
            )
        ''')

    # Tabel log semua pukulan
    c.execute('''
        CREATE TABLE IF NOT EXISTS punch_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT,
            device_id TEXT,
            punch_type TEXT
        )
    ''')

    # Tabel status pukulan terakhir
    c.execute('''
        CREATE TABLE IF NOT EXISTS last_punch (
            device_id TEXT PRIMARY KEY,
            punch_type TEXT,
            timestamp TEXT
        )
    ''')

    conn.commit()
    conn.close()

# Simpan data sensor ke tabel yang sesuai
def save_data(accel, gyro, device_id, table):
    timestamp = datetime.now().isoformat()
    conn = sqlite3.connect("punch_data.db")
    c = conn.cursor()
    c.execute(f'''
        INSERT INTO {table} (timestamp, device_id, accel_x, accel_y, accel_z, gyro_x, gyro_y, gyro_z)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        timestamp,
        device_id,
        accel[0], accel[1], accel[2],
        gyro[0], gyro[1], gyro[2]
    ))
    conn.commit()
    conn.close()
    print(f"✔️ [{table}] Disimpan: {accel} | {gyro} @ {timestamp}")

def save_punch_type(device_id, punch_type):
    timestamp = datetime.now().isoformat()
    conn = sqlite3.connect("punch_data.db")
    c = conn.cursor()

    # Simpan ke punch_log
    c.execute('''
        INSERT INTO punch_log (timestamp, device_id, punch_type)
        VALUES (?, ?, ?)
    ''', (timestamp, device_id, punch_type))

    # Update last_punch
    c.execute('''
        INSERT INTO last_punch (device_id, punch_type, timestamp)
        VALUES (?, ?, ?)
        ON CONFLICT(device_id) DO UPDATE SET
            punch_type = excluded.punch_type,
            timestamp = excluded.timestamp
    ''', (device_id, punch_type, timestamp))

    conn.commit()
    conn.close()
    print(f"🥊 Pukul: {punch_type} ({device_id}) @ {timestamp}")

# Callback ketika berhasil terhubung ke MQTT broker
def on_connect(client, userdata, flags, rc):
    if rc == 0:
        print("🔌 Terhubung ke HiveMQ Cloud")
        for topic, qos in MQTT_TOPICS:
            client.subscribe(topic, qos)
            print(f"📡 Subscribe ke topic: {topic}")
    else:
        print("❌ Gagal terhubung, kode:", rc)

# Callback ketika menerima pesan
def on_message(client, userdata, msg):
    try:
        topic = msg.topic
        payload = msg.payload.decode().strip()

        if topic == "boxing/raw_data_right" or topic == "boxing/raw_data_left":
            parts = payload.split(',')
            if len(parts) != 6:
                print("⚠️ Format data sensor tidak valid:", payload)
                return
            values = list(map(float, parts))
            accel = values[:3]
            gyro = values[3:]

            if topic == "boxing/raw_data_right":
                table = "device_right"
                device_id = "Right"
            else:
                table = "device_left"
                device_id = "Left"

            save_data(accel, gyro, device_id, table)

        elif topic == "boxing/punch_type":
            parts = payload.split(',')
            if len(parts) != 2:
                print("⚠️ Format punch_type tidak valid:", payload)
                return
            punch_type = parts[0].strip()
            device_side = parts[1].strip().lower()
            if device_side == "left":
                device_id = "Left"
            elif device_side == "right":
                device_id = "Right"
            else:
                print("❓ Device tidak dikenali:", device_side)
                return
            if punch_type != "NO PUNCH":
                save_punch_type(device_id, punch_type)

        else:
            print("❓ Topik tidak dikenali:", topic)

    except Exception as e:
        print("❌ Error:", e)

# Fungsi untuk menangani Ctrl+C
def signal_handler(sig, frame):
    print("\n🛑 Dihentikan oleh pengguna.")
    client.loop_stop()
    sys.exit(0)

# Setup dan mulai MQTT
if __name__ == "__main__":
    signal.signal(signal.SIGINT, signal_handler)
    init_db()
    
    client = mqtt.Client()
    client.username_pw_set(MQTT_USERNAME, MQTT_PASSWORD)
    client.tls_set(tls_version=ssl.PROTOCOL_TLS)
    client.on_connect = on_connect
    client.on_message = on_message

    print("🚀 Menghubungkan ke broker...")
    client.connect(MQTT_BROKER, MQTT_PORT)
    client.loop_forever()