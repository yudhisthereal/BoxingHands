import socket
import csv
from datetime import datetime
import keyboard  # Requires: pip install keyboard

# Setup socket
sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
sock.bind(('', 4210))

recording = False
buffer = []

print("Press SPACE to start/stop recording IMU data.")

try:
    while True:
        if keyboard.is_pressed('space'):
            recording = not recording
            if recording:
                buffer.clear()
                print("▶ Recording started...")
            else:
                print("⏹ Recording stopped.")
                if buffer:
                    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
                    filename = f"/home/yudhis/Documents/PlatformIO/Projects/Capstone/src/client/data/imu_log_{timestamp}.csv"
                    with open(filename, mode='w', newline='') as csvfile:
                        writer = csv.writer(csvfile)
                        writer.writerow(['ax', 'ay', 'az', 'gx', 'gy', 'gz'])
                        writer.writerows(buffer)
                    print(f"✔ Data saved to {filename}")
            # Debounce space press
            while keyboard.is_pressed('space'):
                pass

        data, addr = sock.recvfrom(1024)
        decoded = data.decode().strip()
        values = decoded.split(',')

        if len(values) == 6:
            try:
                float_values = [float(v) for v in values]
                if recording:
                    buffer.append(float_values)
                    print("Logged:", float_values)
            except ValueError:
                print("Invalid data:", decoded)

except KeyboardInterrupt:
    print("\nProgram terminated by user.")
