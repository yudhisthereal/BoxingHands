import serial
import csv
from datetime import datetime
import keyboard
import time
import os

# CONFIG
SERIAL_PORT = '/dev/ttyUSB0'  # Adjust as needed
BAUD_RATE = 115200

# Punch types
punch_map = {
    '0': 'no_punch',
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
current_hand = None

# Ensure data directory exists
os.makedirs("data", exist_ok=True)

# Choose hand
def choose_hand():
    global current_hand
    print("Right or Left Hand? (r/l)")
    key = None
    while key not in ['r', 'l']:
        key = keyboard.read_key()
    current_hand = "right" if key == 'r' else "left"
    print(f"🖐️ Using {current_hand.upper()} hand data\n")

# Show punch menu
def show_recording_options():
    for punch in punch_map.items():
        print(f"{punch[0]}: {punch[1]}")
    print("Press 0-4 to start recording. Press SPACE to stop and save.\n")

# Connect to serial
ser = serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=0)
print(f"Connected to {SERIAL_PORT} at {BAUD_RATE} baud.\n")

choose_hand()
show_recording_options()

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
                filename = f"filtered_data/imu_{current_hand}_{current_punch}_{timestamp}.csv"
                with open(filename, mode='w', newline='') as csvfile:
                    writer = csv.writer(csvfile)
                    writer.writerow(['ax', 'ay', 'az', 'gx', 'gy', 'gz'])
                    writer.writerows(buffer)
                print(f"⏹ Recording stopped. ✔ Data saved to {filename}\n")
                buffer.clear()
                current_punch = None
                show_recording_options()
            space_was_pressed = True
        else:
            space_was_pressed = False

        # Read from serial
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

        time.sleep(0.005)  # Smoother and slightly more responsive

except KeyboardInterrupt:
    print("\nProgram terminated by user.")
finally:
    ser.close()
