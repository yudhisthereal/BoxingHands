#include "boxing_model_left.h"

#include <Wire.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <WiFiClientSecure.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <EloquentTinyML.h>

// Configuration macros
#define USE_SERIAL 1
#define USE_MQTT 1
#define USE_DUMMY 0

// I2C Pins
#define SDA_PIN 21
#define SCL_PIN 22

// Input Data
#define SEQ_LENGTH 12
#define N_FEATURES 6

#define N_INPUTS 72
#define N_OUTPUTS 3
#define TENSOR_ARENA_SIZE 15 * 1024

float inputBuffer[SEQ_LENGTH][N_FEATURES] = {0};
int inputIndex = 0;
bool sequenceReady = false;

Eloquent::TinyML::TfLite<N_INPUTS, N_OUTPUTS, TENSOR_ARENA_SIZE> ml;

// WiFi credentials
const char *ssid = "Xiaomi Biru";
const char *password = "tH3od0rer8seve!+";

// MQTT Broker
const char *mqtt_broker = "3e065ffaa6084b219bc6553c8659b067.s1.eu.hivemq.cloud";
const int mqtt_port = 8883;
const char *mqtt_username = "CapstoneUser";
const char *mqtt_password = "Mango!River_42Sun";

// MQTT topics
const char *topic_publish_data = "boxing/raw_data_left"; // raw data
const char *topic_publish_punch = "boxing/punch_type";    // classification results
const char *topic_subscribe = "boxing/control";           // Optional: for receiving commands

// Moving Average Filter Configuration
const int WINDOW_SIZE = 5;
float accelXBuffer[WINDOW_SIZE] = {0};
float accelYBuffer[WINDOW_SIZE] = {0};
float accelZBuffer[WINDOW_SIZE] = {0};
float gyroXBuffer[WINDOW_SIZE] = {0};
float gyroYBuffer[WINDOW_SIZE] = {0};
float gyroZBuffer[WINDOW_SIZE] = {0};
int bufferIndex = 0;
bool bufferFilled = false;

// Dummy Punch
int dummyPunchIndex = 0;

// Bias (IMU KIRI)
const float bias_ax = 1.073;
const float bias_ay = -0.041;
const float bias_az = 0.164;
const float bias_gx = -0.107;
const float bias_gy = -0.015;
const float bias_gz = -0.020;

WiFiClientSecure wifiClient;
PubSubClient mqttClient(wifiClient);
Adafruit_MPU6050 mpu;

// Timing
unsigned long previousMillis = 0;
const long interval = 50;

unsigned long previousPunchMillis = 0;
const long punchInterval = 150;
const char *punchTypes[] = {"no_punch", "jab", "hook"};
const int numPunchTypes = sizeof(punchTypes) / sizeof(punchTypes[0]);

float applyMovingAverage(float newValue, float buffer[], bool &bufferFilled)
{
  buffer[bufferIndex] = newValue;
  float sum = 0;
  int count = bufferFilled ? WINDOW_SIZE : bufferIndex + 1;
  for (int i = 0; i < count; i++)
    sum += buffer[i];
  bufferIndex = (bufferIndex + 1) % WINDOW_SIZE;
  if (!bufferFilled && bufferIndex == 0)
    bufferFilled = true;
  return sum / count;
}

void mqttCallback(char *topic, byte *payload, unsigned int length)
{
#if USE_SERIAL
  Serial.print("Message arrived [");
  Serial.print(topic);
  Serial.print("]: ");
  for (int i = 0; i < length; i++)
  {
    Serial.print((char)payload[i]);
  }
  Serial.println();
#endif
}

void setupMQTT()
{
  mqttClient.setServer(mqtt_broker, mqtt_port);
  mqttClient.setCallback(mqttCallback);
}

void reconnect()
{
#if USE_SERIAL
  Serial.println("Connecting to MQTT Broker...");
#endif
  while (!mqttClient.connected())
  {
    String clientId = "ESP32-MPU6050-";
    clientId += String(random(0xffff), HEX);
#if USE_SERIAL
    Serial.print("Attempting connection as: ");
    Serial.println(clientId);
#endif
    if (mqttClient.connect(clientId.c_str(), mqtt_username, mqtt_password))
    {
#if USE_SERIAL
      Serial.println("Connected to MQTT Broker");
#endif
      mqttClient.subscribe(topic_subscribe);
    }
    else
    {
#if USE_SERIAL
      Serial.print("Failed, rc=");
      Serial.print(mqttClient.state());
      Serial.println(" Retrying in 5 seconds...");
#endif
      delay(5000);
    }
  }
}

void setupModel()
{
  Serial.println("=== [Model Setup Start] ===");

  ml.begin(boxing_model_tflite);

  Serial.println("=== [Model Setup Complete] ===");
}

void setup()
{
#if USE_SERIAL
  Serial.begin(115200);
  delay(1000);
  Serial.println("Initializing MPU6050...");
#endif

  Wire.begin(SDA_PIN, SCL_PIN);

  if (!mpu.begin())
  {
    Serial.println("MPU6050 not found!");
    while (1)
      delay(10);
  }

  mpu.setAccelerometerRange(MPU6050_RANGE_8_G);
  mpu.setGyroRange(MPU6050_RANGE_500_DEG);
  mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);

#if USE_MQTT
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED)
  {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi connected");

  wifiClient.setInsecure();
  setupMQTT();
#endif

#if USE_DUMMY
#else
  setupModel(); // <<< Penting!
#endif
}

void loop()
{
  if (!mqttClient.connected())
    reconnect();
  mqttClient.loop();

  unsigned long currentMillis = millis();

  if (currentMillis - previousMillis >= interval)
  {
    previousMillis = currentMillis;

    sensors_event_t a, g, temp;
    mpu.getEvent(&a, &g, &temp);

    float ax = applyMovingAverage(a.acceleration.x, accelXBuffer, bufferFilled) + bias_ax;
    float ay = applyMovingAverage(a.acceleration.y, accelYBuffer, bufferFilled) + bias_ay;
    float az = applyMovingAverage(a.acceleration.z, accelZBuffer, bufferFilled) + bias_az;
    float gx = applyMovingAverage(g.gyro.x, gyroXBuffer, bufferFilled) + bias_gx;
    float gy = applyMovingAverage(g.gyro.y, gyroYBuffer, bufferFilled) + bias_gy;
    float gz = applyMovingAverage(g.gyro.z, gyroZBuffer, bufferFilled) + bias_gz;

    String sensorData = String(ax, 3) + "," + String(ay, 3) + "," + String(az, 3) + "," +
                        String(gx, 3) + "," + String(gy, 3) + "," + String(gz, 3);

#if USE_SERIAL
    Serial.println(sensorData);
#endif

    mqttClient.publish(topic_publish_data, sensorData.c_str());

    inputBuffer[inputIndex][0] = ax;
    inputBuffer[inputIndex][1] = ay;
    inputBuffer[inputIndex][2] = az;
    inputBuffer[inputIndex][3] = gx;
    inputBuffer[inputIndex][4] = gy;
    inputBuffer[inputIndex][5] = gz;

    inputIndex++;
    if (inputIndex >= SEQ_LENGTH)
    {
      sequenceReady = true;
      inputIndex = 0;
    }
  }

  if (currentMillis - previousPunchMillis >= punchInterval)
  {
    previousPunchMillis = currentMillis;

#if USE_DUMMY
    // Calculate magnitude of acceleration
    float accelMagnitude = sqrt(
        inputBuffer[(inputIndex == 0 ? SEQ_LENGTH : inputIndex) - 1][0] * inputBuffer[(inputIndex == 0 ? SEQ_LENGTH : inputIndex) - 1][0] +
        inputBuffer[(inputIndex == 0 ? SEQ_LENGTH : inputIndex) - 1][1] * inputBuffer[(inputIndex == 0 ? SEQ_LENGTH : inputIndex) - 1][1] +
        inputBuffer[(inputIndex == 0 ? SEQ_LENGTH : inputIndex) - 1][2] * inputBuffer[(inputIndex == 0 ? SEQ_LENGTH : inputIndex) - 1][2]);

    static bool sentNoPunch = false;

    if (accelMagnitude > 17.0)
    {
      const char *dummyPunch = punchTypes[dummyPunchIndex];
      dummyPunchIndex = (dummyPunchIndex + 1) % (numPunchTypes);
      String result = String(dummyPunch) + ", Right";
      mqttClient.publish(topic_publish_punch, result.c_str());
      sentNoPunch = false;
    }
    else if (!sentNoPunch)
    {
      String result = String("no_punch") + ", Right";
      mqttClient.publish(topic_publish_punch, result.c_str());
      sentNoPunch = true;
    }
#else
    if (sequenceReady)
    {
      float flatInput[N_INPUTS];
      for (int i = 0; i < SEQ_LENGTH; i++)
      {
        for (int j = 0; j < N_FEATURES; j++)
        {
          flatInput[i * N_FEATURES + j] = inputBuffer[i][j];
        }
      }

      float output[N_OUTPUTS];       // output buffer to hold probabilities
      ml.predict(flatInput, output); // run inference and fill output[]

      int predictedClass = 0;
      float maxProb = output[0];
      for (int i = 1; i < N_OUTPUTS; i++)
      {
        if (output[i] > maxProb)
        {
          maxProb = output[i];
          predictedClass = i;
        }
      }

      const char *punchLabel = punchTypes[predictedClass];
      String result = String(punchLabel) + ", Left";

      Serial.println("Inference: " + result);
      mqttClient.publish(topic_publish_punch, result.c_str());

      sequenceReady = false;
      inputIndex = 0;
    }
#endif
  }
}
