// Configuration macros
#define LEFT 1
#define RIGHT 0
#define USE_SERIAL 0
#define USE_MQTT 1
#define USE_DUMMY 0

#if LEFT
#include "boxing_model_left_8.h"
#elif RIGHT
#include "boxing_model_right_8.h"
#endif

#include <mqtt_credentials.h>
#include <wifi_credentials.h>
#include <Wire.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <WiFiClientSecure.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <TensorFlowLite_ESP32.h>

#include "tensorflow/lite/micro/all_ops_resolver.h"
#include "tensorflow/lite/micro/micro_error_reporter.h"
#include "tensorflow/lite/micro/micro_interpreter.h"
#include "tensorflow/lite/schema/schema_generated.h"

// I2C Pins
#define SDA_PIN 21
#define SCL_PIN 22

// Input Data
#if LEFT
#define SEQ_LENGTH 8
#elif RIGHT
#define SEQ_LENGTH 8
#endif

#define N_FEATURES 6
#define N_INPUTS (SEQ_LENGTH * N_FEATURES)
#define CLASSIFIER_COOLDOWN 13 // rest classifier for few timesteps after a classification other than NO PUNCH
#define AFTERJAB_COOLDOWN 500  // in ms, to avoid false HOOK commonly classified by our model
#define STRIDE 1               // how often to classify

#if RIGHT
#define WINDOW_SIZE 5
#elif LEFT
#define WINDOW_SIZE 5
#endif

#define N_OUTPUTS 3
#define TENSOR_ARENA_SIZE 24 * 1024
#define MIN_CONFIDENCE 0.5

#if RIGHT
#define MIN_ACCEL_MAGNITUDE 20.0
#elif LEFT
#define MIN_ACCEL_MAGNITUDE 16.0
#endif

float inputBuffer[SEQ_LENGTH][N_FEATURES] = {0};
int inputIndex = 0;
int sampleCount = 0;
int strideCounter = 0;
bool sequenceReady = false;

// Declare TFLite globals
tflite::MicroInterpreter *interpreter;
tflite::ErrorReporter *error_reporter;
tflite::AllOpsResolver resolver;
tflite::MicroErrorReporter micro_error_reporter;

const tflite::Model *model = nullptr;
TfLiteTensor *input = nullptr;
TfLiteTensor *output = nullptr;

uint8_t tensor_arena[TENSOR_ARENA_SIZE];

// MQTT topics
#if LEFT
const char *topic_publish_data = "boxing/raw_data_left"; // raw data
#elif RIGHT
const char *topic_publish_data = "boxing/raw_data_right"; // raw data
#endif

const char *topic_publish_punch = "boxing/punch_type"; // classification results
const char *topic_subscribe = "boxing/control";        // Optional: for receiving commands

// Moving Average Filter Configuration
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

#if LEFT
const float bias_ax = 1.073;
const float bias_ay = -0.041;
const float bias_az = 0.164;
const float bias_gx = -0.107;
const float bias_gy = -0.015;
const float bias_gz = -0.020;
#elif RIGHT
const float bias_ax = 0.852;
const float bias_ay = -0.335;
const float bias_az = 0.376;
const float bias_gx = -0.023;
const float bias_gy = 0.002;
const float bias_gz = -0.016;
#endif

WiFiClientSecure wifiClient;
PubSubClient mqttClient(wifiClient);
Adafruit_MPU6050 mpu;

// Timing
unsigned long previousMillis = 0;
const long interval = 50;

unsigned long lastJabTime = 0;
int cooldownSamplesRemaining = 0;

unsigned long previousPunchMillis = 0;
const long punchInterval = 50;

#if LEFT
const char *punchTypes[] = {"NO PUNCH", "JAB", "HOOK"};
#elif RIGHT
const char *punchTypes[] = {"NO PUNCH", "STRAIGHT", "UPPERCUT"};
#endif

String lastPunchType = "";
// const int numPunchTypes = sizeof(punchTypes) / sizeof(punchTypes[0]);

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

  // Set up logging (optional but useful for debugging)
  error_reporter = &micro_error_reporter;

// Load model
#if RIGHT
  model = tflite::GetModel(boxing_model_right_8_tflite);
#elif LEFT
  model = tflite::GetModel(boxing_model_left_8_tflite);
#endif

  if (model->version() != TFLITE_SCHEMA_VERSION)
  {
    Serial.println("Model schema version mismatch!");
    return;
  }

  // Set up resolver and interpreter
  interpreter = new tflite::MicroInterpreter(model, resolver, tensor_arena, TENSOR_ARENA_SIZE, error_reporter);

  // Allocate memory for tensors
  TfLiteStatus allocate_status = interpreter->AllocateTensors();
  if (allocate_status != kTfLiteOk)
  {
    Serial.println("AllocateTensors() failed");
    return;
  }

  // Get pointers to input and output tensors
  input = interpreter->input(0);
  output = interpreter->output(0);

  Serial.println("=== [Model Setup Complete] ===");
}

void setup()
{
  Serial.begin(115200);
#if USE_SERIAL
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

#if USE_SERIAL
  Serial.println("MPU6050 initialized!");
#endif

  mpu.setAccelerometerRange(MPU6050_RANGE_8_G);
  mpu.setGyroRange(MPU6050_RANGE_500_DEG);
  mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);

#if USE_MQTT
  WiFi.begin(ssid, password);
#if USE_SERIAL
  Serial.println("connecting to Wi-Fi: " + String(ssid));
#endif
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
  setupModel();
#endif
}

class BoxingModel
{
public:
  void predict(float *input_data, float *output_data)
  {
    for (int i = 0; i < N_INPUTS; i++)
    {
      input->data.f[i] = input_data[i];
    }

    if (interpreter->Invoke() != kTfLiteOk)
    {
      Serial.println("Model invocation failed!");
      return;
    }

    for (int i = 0; i < N_OUTPUTS; i++)
    {
      output_data[i] = output->data.f[i];
    }
  }
};

BoxingModel ml;

void loop()
{
#if USE_MQTT
  if (!mqttClient.connected())
    reconnect();
  mqttClient.loop();
#endif

  unsigned long currentMillis = millis();

  if (currentMillis - previousMillis >= interval)
  {
    previousMillis = currentMillis;

    sensors_event_t a, g;
    mpu.getEvent(&a, &g, nullptr);

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

    // Shift buffer left by 1 to make room for new sample
    for (int i = 0; i < SEQ_LENGTH - 1; i++)
    {
      for (int j = 0; j < N_FEATURES; j++)
      {
        inputBuffer[i][j] = inputBuffer[i + 1][j];
      }
    }

    inputBuffer[SEQ_LENGTH - 1][0] = ax;
    inputBuffer[SEQ_LENGTH - 1][1] = ay;
    inputBuffer[SEQ_LENGTH - 1][2] = az;
    inputBuffer[SEQ_LENGTH - 1][3] = gx;
    inputBuffer[SEQ_LENGTH - 1][4] = gy;
    inputBuffer[SEQ_LENGTH - 1][5] = gz;

    sampleCount++;
    strideCounter++;

    if (strideCounter >= STRIDE && sampleCount >= SEQ_LENGTH)
    {
      sequenceReady = true;
      strideCounter = 0; // reset after every classification
    }
  }

  if (currentMillis - previousPunchMillis >= punchInterval)
  {
    previousPunchMillis = currentMillis;

#if USE_DUMMY
    inputIndex = (inputIndex + 1) % SEQ_LENGTH;
    // Calculate magnitude of acceleration
    float accelMagnitude = sqrt(
        inputBuffer[(inputIndex == 0 ? SEQ_LENGTH : inputIndex) - 1][0] * inputBuffer[(inputIndex == 0 ? SEQ_LENGTH : inputIndex) - 1][0] +
        inputBuffer[(inputIndex == 0 ? SEQ_LENGTH : inputIndex) - 1][1] * inputBuffer[(inputIndex == 0 ? SEQ_LENGTH : inputIndex) - 1][1] +
        inputBuffer[(inputIndex == 0 ? SEQ_LENGTH : inputIndex) - 1][2] * inputBuffer[(inputIndex == 0 ? SEQ_LENGTH : inputIndex) - 1][2]);

    static bool sentNoPunch = false;

    if (accelMagnitude > 17.0)
    {
      const char *dummyPunch = punchTypes[dummyPunchIndex];
      dummyPunchIndex = (dummyPunchIndex + 1) % (N_OUTPUTS);
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
      float accelMagnitude = 0.0;
      if (cooldownSamplesRemaining > 0)
      {
        cooldownSamplesRemaining--;
      }
      else
      {
        // --- Calculate the maximum acceleration magnitude over the entire inputBuffer
        for (int i = 0; i < SEQ_LENGTH; i++)
        {
          float ax = inputBuffer[i][0];
          float ay = inputBuffer[i][1];
          float az = inputBuffer[i][2];

          float magnitude = sqrt(ax * ax + ay * ay + az * az);
          if (magnitude > accelMagnitude)
          {
            accelMagnitude = magnitude;
          }
        }
      }

      // Skip classification if below threshold
      if (accelMagnitude < MIN_ACCEL_MAGNITUDE)
      {
#if USE_SERIAL
        Serial.println("Skipped classification due to low accel magnitude. (" + String(accelMagnitude) + ")");
        lastPunchType = "NO PUNCH";
#endif
      }
      else
      {

        float flatInput[N_INPUTS];
        for (int i = 0; i < SEQ_LENGTH; i++)
        {
          for (int j = 0; j < N_FEATURES; j++)
          {
            flatInput[i * N_FEATURES + j] = inputBuffer[i][j];
          }
        }

        float output[N_OUTPUTS];

        unsigned long startPred = millis();
        ml.predict(flatInput, output);
        unsigned long endPred = millis();
        Serial.println("Predict time: " + String(endPred - startPred) + "ms");

        int predictedClass = 0;
        float maxProb = output[predictedClass];
        for (byte i = 0; i < N_OUTPUTS; i++)
        {
          if (output[i] > maxProb)
          {
            maxProb = output[i];
            predictedClass = i;
          }
#if USE_SERIAL
          Serial.println(String(punchTypes[i]) + ": " + String(output[i]));
#endif
        }

        const char *punchLabel = punchTypes[predictedClass];
        String punchLabelStr = String(punchLabel);

        #if LEFT
        String result = punchLabelStr + ", Left";
        #elif RIGHT
        String result = punchLabelStr + ", Right";
        #endif

        #if USE_SERIAL
        Serial.println("PUNCH: " + punchLabelStr);
        #endif
        
        // Only publish if confident and NOT "NO PUNCH"
        if (punchLabelStr != "NO PUNCH")
        {
          unsigned long now = millis();

          bool blockHookAfterJab = (punchLabelStr == "HOOK") &&
                                   (now - lastJabTime < AFTERJAB_COOLDOWN);

          if ((!blockHookAfterJab || punchLabelStr != "HOOK") && maxProb > MIN_CONFIDENCE)
          {
            mqttClient.publish(topic_publish_punch, result.c_str());
#if USE_SERIAL
            Serial.println("PUBLISHED " + punchLabelStr);
#endif
            if (punchLabelStr == "JAB")
            {
              lastJabTime = now;
            }

            cooldownSamplesRemaining = CLASSIFIER_COOLDOWN;
          }
          else if (maxProb <= MIN_CONFIDENCE)
          {
#if USE_SERIAL
            Serial.println("Confidence: " + String(maxProb));
#endif
          }
          else if (blockHookAfterJab)
          {
          }
        }

        lastPunchType = punchLabelStr;
      }
#endif
  }
}
}
