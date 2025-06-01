import csv
from datetime import datetime
import keyboard
import time
import ssl
import paho.mqtt.client as mqtt

# MQTT config
MQTT_BROKER = "3e065ffaa6084b219bc6553c8659b067.s1.eu.hivemq.cloud"
MQTT_PORT = 8883
MQTT_USERNAME = "CapstoneUser"
MQTT_PASSWORD = "Mango!River_42Sun"
TOPIC_RAW_DATA_LEFT = "boxing/raw_data_left"
TOPIC_RAW_DATA_RIGHT = "boxing/raw_data_right"

# Punch types
punch_map = {
    '0': 'no_punch',
    '1': 'jab',
    '2': 'straight',
    '3': 'hook',
    '4': 'uppercut'
}

# State variables
hand = "not_chosen"
recording = False
current_punch = None
buffer = []
key_states = {k: False for k in punch_map.keys()}
space_was_pressed = False

# MQTT message handler
def on_message(client, userdata, msg):
    global recording, buffer
    try:
        payload = msg.payload.decode().strip()
        values = payload.split(',')
        if len(values) == 6:
            if recording:
                float_values = [float(v) for v in values]
                buffer.append(float_values)
                print("Logged:", float_values)
    except Exception as e:
        print("MQTT decode error:", e)

# Choose Right/Left Hand
def choose_hand_and_resubscribe_topic():
    global topic_raw_data, client

    if topic_raw_data:
        client.unsubscribe(topic_raw_data)
    topic_raw_data = None

    time.sleep(0.7)
    print("Right or Left Hand? (r/l)")
    key = keyboard.read_key()
    if key == 'r':
        topic_raw_data = TOPIC_RAW_DATA_RIGHT
    elif key == 'l':
        topic_raw_data = TOPIC_RAW_DATA_LEFT

    client.subscribe(topic_raw_data)
                
# Show recording options interface
def show_recording_options():
    for punch in punch_map.items():
        print(f"{punch[0]}: {punch[1]}")
    print("Press 0-4 to start recording. Press SPACE to stop and save.\n")

# MQTT setup
topic_raw_data = None
client = mqtt.Client()
client.username_pw_set(MQTT_USERNAME, MQTT_PASSWORD)
client.tls_set(cert_reqs=ssl.CERT_NONE)
client.tls_insecure_set(True)
client.on_message = on_message
client.connect(MQTT_BROKER, MQTT_PORT)
client.loop_start()

print("Connected to MQTT broker.")
choose_hand_and_resubscribe_topic()
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
                filename = f"data/imu_{current_punch}_{timestamp}.csv"
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

        time.sleep(0.005)

except KeyboardInterrupt:
    print("\nProgram terminated by user.")
finally:
    client.loop_stop()
    client.disconnect()
