import serial
import csv
from datetime import datetime
import time

# CONFIG
SERIAL_PORT = '/dev/ttyUSB1'  # Change if needed
BAUD_RATE = 115200


# State variable
buffer = []

# Connect to serial
ser = serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=0)  # <- Non-blocking
print(f"Connected to {SERIAL_PORT} at {BAUD_RATE} baud.")

import time

def calibrate_bias(ser, sample_count=1000):
    print(f"Starting bias calibration with {sample_count} samples...")

    collected = 0
    sum_ax = sum_ay = sum_az = 0.0
    sum_gx = sum_gy = sum_gz = 0.0

    while collected < sample_count:
        if ser.in_waiting > 0:
            try:
                line = ser.readline().decode(errors='ignore').strip()
                values = line.split(',')
                if len(values) == 6:
                    ax, ay, az, gx, gy, gz = map(float, values)
                    sum_ax += ax
                    sum_ay += ay
                    sum_az += az
                    sum_gx += gx
                    sum_gy += gy
                    sum_gz += gz
                    collected += 1

                    if collected % 100 == 0:
                        print(f"{collected}/{sample_count} samples collected...")
            except Exception as e:
                print("Calibration read error:", e)

        time.sleep(0.01)  # Small delay to ease CPU

    # Compute mean (bias)
    bias_ax = sum_ax / sample_count
    bias_ay = sum_ay / sample_count
    bias_az = sum_az / sample_count + 9.81  # Adjust for gravity
    bias_gx = sum_gx / sample_count
    bias_gy = sum_gy / sample_count
    bias_gz = sum_gz / sample_count

    print("\nCalibration complete.")
    print(f"Bias ax: {bias_ax:.3f}")
    print(f"Bias ay: {bias_ay:.3f}")
    print(f"Bias az: {bias_az:.3f}  (expected 0 after gravity compensation)")
    print(f"Bias gx: {bias_gx:.3f}")
    print(f"Bias gy: {bias_gy:.3f}")
    print(f"Bias gz: {bias_gz:.3f}")

if __name__ == "__main__":
    calibrate_bias(ser)

