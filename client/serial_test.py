import serial

# Serial port config
SERIAL_PORT = '/dev/ttyUSB0'  # Change if needed
BAUD_RATE = 115200

# Open serial connection
ser = serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=1)
print(f"Connected to {SERIAL_PORT} at {BAUD_RATE} baud.")
print("Reading data...\nPress Ctrl+C to stop.")

try:
    while True:
        if ser.in_waiting > 0:
            line = ser.readline().decode(errors='ignore').strip()
            print(line)

except KeyboardInterrupt:
    print("\nStopped by user.")

finally:
    ser.close()
    print("Serial connection closed.")
