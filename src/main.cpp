#include <WiFi.h>
#include <Wire.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <WiFiUdp.h>

// WiFi credentials
const char* ssid = "Xiaomi Biru";
const char* password = "tH3od0rer8seve!+";

// UDP settings
const char* remoteIp = "192.168.43.130";  // <-- Laptop's IP (own is 192.168.43.83)
const char* broadcastIp = "192.168.43.255"; // <-- only used if direct IP is not working
const int udpPort = 4210;
WiFiUDP udp;

// IMU
Adafruit_MPU6050 mpu;

void setup() {
  Serial.begin(115200);
  delay(1000);

  // Start I2C
  Wire.begin();

  // Initialize MPU6050
  if (!mpu.begin()) {
    Serial.println("Failed to find MPU6050 chip");
    while (1) { delay(10); }
  }

  Serial.println("MPU6050 Found!");

  // Configure MPU6050 ranges
  mpu.setAccelerometerRange(MPU6050_RANGE_8_G);
  mpu.setGyroRange(MPU6050_RANGE_500_DEG);
  mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);

  // Connect to WiFi
  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nConnected to WiFi");
  Serial.print("ESP32 IP Address: ");
  Serial.println(WiFi.localIP());

  udp.begin(udpPort);
}

void loop() {
  sensors_event_t a, g, temp;
  mpu.getEvent(&a, &g, &temp);

  // Format data as CSV: ax,ay,az,gx,gy,gz
  String data = String(a.acceleration.x, 3) + "," + 
                String(a.acceleration.y, 3) + "," + 
                String(a.acceleration.z, 3) + "," + 
                String(g.gyro.x, 3) + "," + 
                String(g.gyro.y, 3) + "," + 
                String(g.gyro.z, 3);

  // Send via UDP
  udp.beginPacket(remoteIp, udpPort);
  udp.print(data);
  udp.endPacket();

  Serial.println("Sent: " + data);
  delay(50);  // ~20Hz
}
