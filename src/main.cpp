#include <Wire.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <WiFi.h>
#include <PubSubClient.h>

// Configuration macros
#define USE_SERIAL 1
#define USE_MQTT 0

// I2C Pins
#define SDA_PIN 21
#define SCL_PIN 22

// WiFi credentials
const char* ssid = "Xiaomi Biru";
const char* password = "tH3od0rer8seve!+";

// MQTT Broker
const char* mqtt_server = "3e065ffaa6084b219bc6553c8659b067.s1.eu.hivemq.cloud";
const int mqtt_port = 8883;
const char* mqtt_topic = "boxing/mpu6050"; // Changed to boxing/ prefix

// MQTT User
const char* mqtt_user = "CapstoneUser";
const char* mqtt_password = "Mango!River_42Sun";

// Generate unique client ID from MAC address
String getUniqueClientID() {
  String mac = WiFi.macAddress();
  mac.replace(":", "");
  return "ESP32_" + mac;
}

// IMU and MQTT Clients
Adafruit_MPU6050 mpu;
WiFiClient espClient;
PubSubClient client(espClient);
String mqtt_client_id; // Will be set in setup()

void setup_wifi() {
  #if USE_SERIAL
    Serial.println("\nConnecting to WiFi...");
  #endif
  
  WiFi.begin(ssid, password);
  
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    #if USE_SERIAL
      Serial.print(".");
    #endif
  }

  // Generate unique ID after WiFi connects
  mqtt_client_id = getUniqueClientID();
  
  #if USE_SERIAL
    Serial.println("\nWiFi connected!");
    Serial.print("IP: "); Serial.println(WiFi.localIP());
    Serial.print("MQTT Client ID: "); Serial.println(mqtt_client_id);
  #endif
}

void reconnect() {
  while (!client.connected()) {
    #if USE_SERIAL
      Serial.print("MQTT connecting as "); Serial.print(mqtt_client_id);
    #endif
    
    if (client.connect(mqtt_client_id.c_str(), mqtt_user, mqtt_password)) {
      #if USE_SERIAL
        Serial.println(" - Connected!");
      #endif
    } else {
      #if USE_SERIAL
        Serial.print(" - Failed! RC="); Serial.print(client.state());
        Serial.println(" Retrying in 5s...");
      #endif
      delay(5000);
    }
  }
}

void setup() {
  Wire.begin(SDA_PIN, SCL_PIN);
  
  #if USE_SERIAL
    Serial.begin(115200);
    delay(1000);
    Serial.println("Starting MPU6050...");
  #endif

  if (!mpu.begin()) {
    #if USE_SERIAL
      Serial.println("MPU6050 not found!");
    #endif
    while (1) delay(10);
  }

  mpu.setAccelerometerRange(MPU6050_RANGE_8_G);
  mpu.setGyroRange(MPU6050_RANGE_500_DEG);
  mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);

  #if USE_MQTT
    setup_wifi();
    client.setServer(mqtt_server, mqtt_port);
  #endif
}

void loop() {
  #if USE_MQTT
    if (!client.connected()) reconnect();
    client.loop();
  #endif

  sensors_event_t a, g, temp;
  mpu.getEvent(&a, &g, &temp);

  String data = String(a.acceleration.x, 3) + "," + 
               String(a.acceleration.y, 3) + "," + 
               String(a.acceleration.z, 3) + "," + 
               String(g.gyro.x, 3) + "," + 
               String(g.gyro.y, 3) + "," + 
               String(g.gyro.z, 3);

  #if USE_SERIAL
    Serial.println(data);
  #endif

  #if USE_MQTT
    if (client.connected()) {
      client.publish(mqtt_topic, data.c_str());
    }
  #endif

  delay(50); // ~20Hz
}