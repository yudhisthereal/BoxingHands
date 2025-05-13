import serial
import csv
from datetime import datetime
import keyboard
import time

# CONFIG
SERIAL_PORT = '/dev/ttyUSB0'  # Change if needed
BAUD_RATE = 115200

# Punch types
punch_map = {
    '1': 'jab',
    '2': 'straight',
    '3': 'hook',
    '4': 'uppercut'
}

# State variables
recording = False
current_punch = None
buffer = []
key_states = {k: False for k in punch_map.keys()}
space_was_pressed = False

# Connect to serial
ser = serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=0)  # <- Non-blocking
print(f"Connected to {SERIAL_PORT} at {BAUD_RATE} baud.")
print("Press 1-4 to start recording. Press SPACE to stop and save.\n")

try:
    while True:
        # Handle punch keypresses
        for key in punch_map.keys():
            if keyboard.is_pressed(key):
                if not key_states[key] and not recording:
                    current_punch = punch_map[key]
                    recording = True
                    buffer.clear()
                    print(f"▶ Recording started for: {current_punch}")
                key_states[key] = True
            else:
                key_states[key] = False

        # Handle space to stop/save
        if keyboard.is_pressed('space'):
            if not space_was_pressed and recording:
                recording = False
                timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
                filename = f"data/imu_{current_punch}_{timestamp}.csv"
                with open(filename, mode='w', newline='') as csvfile:
                    writer = csv.writer(csvfile)
                    writer.writerow(['ax', 'ay', 'az', 'gx', 'gy', 'gz'])
                    writer.writerows(buffer)
                print(f"⏹ Recording stopped. ✔ Data saved to {filename}\n")
                buffer.clear()
                current_punch = None
            space_was_pressed = True
        else:
            space_was_pressed = False

        # Non-blocking serial read
        if ser.in_waiting > 0:
            try:
                line = ser.readline().decode(errors='ignore').strip()
                values = line.split(',')
                if len(values) == 6:
                    if recording:
                        float_values = [float(v) for v in values]
                        buffer.append(float_values)
                        print("Logged:", float_values)
            except Exception as e:
                print("Read error:", e)

        time.sleep(0.01)  # Small sleep to ease CPU load

except KeyboardInterrupt:
    print("\nProgram terminated by user.")
finally:
    ser.close()
