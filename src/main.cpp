#include <Wire.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <WiFiClientSecure.h>
#include <WiFi.h>
#include <PubSubClient.h>

// Configuration macros
#define USE_SERIAL 1
#define USE_MQTT 1

// I2C Pins
#define SDA_PIN 21
#define SCL_PIN 22

// WiFi credentials
const char* ssid = "Xiaomi Biru";
const char* password = "tH3od0rer8seve!+";

// MQTT Broker
const char* mqtt_broker = "3e065ffaa6084b219bc6553c8659b067.s1.eu.hivemq.cloud";
const int mqtt_port = 8883;
const char* mqtt_username = "CapstoneUser";
const char* mqtt_password = "Mango!River_42Sun";

// MQTT topics
const char* topic_publish_data = "boxing/raw_data_left"; // raw data
const char* topic_publish_punch = "boxing/punch_type"; // classification results
const char* topic_subscribe = "boxing/control"; // Optional: for receiving commands

// Moving Average Filter Configuration
const int WINDOW_SIZE = 5; // Number of samples to average (adjust based on your needs)

// Create instances
WiFiClientSecure wifiClient;
PubSubClient mqttClient(wifiClient);
Adafruit_MPU6050 mpu;

// Timing variables
unsigned long previousMillis = 0;
const long interval = 50; // 20Hz (50ms)

// const float bias_IMU KANAN
// const float bias_ax = 0.852;
// const float bias_ay = -0.335;
// const float bias_az = 0.376;
// const float bias_gx = -0.023;
// const float bias_gy = 0.002;
// const float bias_gz = -0.016;

// const float bias_IMU KIRI
const float bias_ax = 1.073;
const float bias_ay = -0.041;
const float bias_az = 0.164;
const float bias_gx = -0.107;
const float bias_gy = -0.015;
const float bias_gz = -0.020;

// 

// Data buffers for moving average
float accelXBuffer[WINDOW_SIZE] = {0};
float accelYBuffer[WINDOW_SIZE] = {0};
float accelZBuffer[WINDOW_SIZE] = {0};
float gyroXBuffer[WINDOW_SIZE] = {0};
float gyroYBuffer[WINDOW_SIZE] = {0};
float gyroZBuffer[WINDOW_SIZE] = {0};
int bufferIndex = 0;
bool bufferFilled = false;

// Moving average filter function
float applyMovingAverage(float newValue, float buffer[], bool &bufferFilled) {
  // Add new value to buffer
  buffer[bufferIndex] = newValue;
  
  // Calculate average
  float sum = 0;
  int count = bufferFilled ? WINDOW_SIZE : bufferIndex + 1;
  
  for (int i = 0; i < count; i++) {
    sum += buffer[i];
  }
  
  // Update index for next sample
  bufferIndex = (bufferIndex + 1) % WINDOW_SIZE;
  
  // Check if buffer is completely filled
  if (!bufferFilled && bufferIndex == 0) {
    bufferFilled = true;
  }
  
  return sum / count;
}

// Callback function for incoming messages
void mqttCallback(char* topic, byte* payload, unsigned int length) {
  #if USE_SERIAL
    Serial.print("Message arrived [");
    Serial.print(topic);
    Serial.print("]: ");
    for (int i = 0; i < length; i++) {
      Serial.print((char)payload[i]);
    }
    Serial.println();
  #endif
}

void setupMQTT() {
  mqttClient.setServer(mqtt_broker, mqtt_port);
  mqttClient.setCallback(mqttCallback);
}

void reconnect() {
  #if USE_SERIAL
    Serial.println("Connecting to MQTT Broker...");
  #endif
  
  while (!mqttClient.connected()) {
    String clientId = "ESP32-MPU6050-";
    clientId += String(random(0xffff), HEX); // Random client ID
    
    #if USE_SERIAL
      Serial.print("Attempting connection as: ");
      Serial.println(clientId);
    #endif
    
    if (mqttClient.connect(clientId.c_str(), mqtt_username, mqtt_password)) {
      #if USE_SERIAL
        Serial.println("Connected to MQTT Broker");
      #endif
      
      // Subscribe to control topic if needed
      mqttClient.subscribe(topic_subscribe);
    } else {
      #if USE_SERIAL
        Serial.print("Failed, rc=");
        Serial.print(mqttClient.state());
        Serial.println(" Retrying in 5 seconds...");
      #endif
      delay(5000);
    }
  }
}

unsigned long previousPunchMillis = 0;
const long punchInterval = 150; // 150ms
const char* punchTypes[] = {"jab", "hook", "no_punch", "no_punch", "no_punch"};
const int numPunchTypes = sizeof(punchTypes) / sizeof(punchTypes[0]);

void setup() {
  #if USE_SERIAL
    Serial.begin(115200);
    delay(1000);
    Serial.println("Initializing MPU6050...");
  #endif

  // Initialize I2C
  Wire.begin(SDA_PIN, SCL_PIN);

  // Initialize MPU6050
  if (!mpu.begin()) {
    #if USE_SERIAL
      Serial.println("Failed to find MPU6050 chip");
    #endif
    while (1) { delay(10); }
  }

  // Configure MPU6050
  mpu.setAccelerometerRange(MPU6050_RANGE_8_G);
  mpu.setGyroRange(MPU6050_RANGE_500_DEG);
  mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);

  // Connect to WiFi
  #if USE_SERIAL
    Serial.print("Connecting to WiFi");
  #endif
  
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    #if USE_SERIAL
      Serial.print(".");
    #endif
  }
  
  #if USE_SERIAL
    Serial.println("\nWiFi connected");
    Serial.print("IP address: ");
    Serial.println(WiFi.localIP());
  #endif

  // Configure MQTT (insecure for testing - replace with proper cert in production)
  wifiClient.setInsecure(); // Bypass SSL certificate validation
  setupMQTT();
}

void loop() {
  #if USE_MQTT
    if (!mqttClient.connected()) {
      reconnect();
    }
    mqttClient.loop();
  #endif

  unsigned long currentMillis = millis();

  // Raw data publishing (every 50 ms)
  if (currentMillis - previousMillis >= interval) {
    previousMillis = currentMillis;

    // Read sensor data
    sensors_event_t a, g, temp;
    mpu.getEvent(&a, &g, &temp);

    // Apply moving average filter
    float filteredAccelX = applyMovingAverage(a.acceleration.x, accelXBuffer, bufferFilled) + bias_ax;
    float filteredAccelY = applyMovingAverage(a.acceleration.y, accelYBuffer, bufferFilled) + bias_ay;
    float filteredAccelZ = applyMovingAverage(a.acceleration.z, accelZBuffer, bufferFilled) + bias_az;
    float filteredGyroX = applyMovingAverage(g.gyro.x, gyroXBuffer, bufferFilled) + bias_gx;
    float filteredGyroY = applyMovingAverage(g.gyro.y, gyroYBuffer, bufferFilled) + bias_gy;
    float filteredGyroZ = applyMovingAverage(g.gyro.z, gyroZBuffer, bufferFilled) + bias_gz;

    String sensorData = String(filteredAccelX, 3) + "," + 
                        String(filteredAccelY, 3) + "," + 
                        String(filteredAccelZ, 3) + "," + 
                        String(filteredGyroX, 3) + "," + 
                        String(filteredGyroY, 3) + "," + 
                        String(filteredGyroZ, 3);

    #if USE_SERIAL
      Serial.println(sensorData);
    #endif

    #if USE_MQTT
      if (mqttClient.connected()) {
        mqttClient.publish(topic_publish_data, sensorData.c_str());
      }
    #endif
  }

  // Dummy punch type publishing (every 150 ms)
  if (currentMillis - previousPunchMillis >= punchInterval) {
    previousPunchMillis = currentMillis;

    int randomIndex = random(0, numPunchTypes); // pick random punch type
    String randomPunch = String(punchTypes[randomIndex]) + ", Left";

    #if USE_SERIAL
      Serial.print("Dummy Punch: ");
      Serial.println(randomPunch);
    #endif

    #if USE_MQTT
      if (mqttClient.connected()) {
        mqttClient.publish(topic_publish_punch, randomPunch.c_str());
      }
    #endif
  }
}