// Inisialisasi variabel global untuk status sistem, pukulan terakhir, dan urutan pukulan
let isRunning = false; // Menyimpan status apakah sistem sedang berjalan
let lastPunchTimestamp = 0; // Timestamp pukulan terakhir yang terdeteksi
const punchTimeout = 2000; // Timeout (dalam milidetik) untuk reset urutan pukulan setelah waktu tertentu
let punchHistory = []; // Menyimpan riwayat pukulan
let lastPunchType = ""; // Menyimpan jenis pukulan terakhir
let lastDeviceId = ""; // Menyimpan ID perangkat terakhir yang digunakan
let punchSequence = []; // Menyimpan urutan pukulan yang dilakukan
let comboTimeout = null; // Timeout untuk mereset combo pukulan

// Inisialisasi orientasi sensor untuk kiri dan kanan (roll, pitch, yaw)
const imu_orientation = {
  left: { roll: 0, pitch: 0, yaw: 0 }, // Orientasi sensor kiri
  right: { roll: 0, pitch: 0, yaw: 0 }, // Orientasi sensor kanan
};

// Referensi ke elemen kontrol untuk mengaktifkan musik latar dan efek suara
const toggleBacksound = document.getElementById("toggle-backsound"); // Kontrol musik latar
const toggleSFX = document.getElementById("toggle-sfx"); // Kontrol efek suara
const backgroundMusic = document.getElementById("backgroundMusic"); // Elemen audio untuk musik latar

let isSFXEnabled = true; // Menyimpan status apakah efek suara diaktifkan
let isBacksoundEnabled = true; // Menyimpan status apakah musik latar diaktifkan

// Menyimpan data akselerometer 3D untuk kiri dan kanan (x, y, z)
const accel3DHistory = {
  left: { x: [], y: [], z: [] },
  right: { x: [], y: [], z: [] },
};

// Event listener untuk men-toggle grafik antara tampilan visual 3D dan grafik biasa
document.getElementById("graphToggle").addEventListener("change", function () {
  const isChecked = this.checked; // Mengecek apakah checkbox sudah dicentang
  const label = document.getElementById("graphToggleLabel");
  const chartTab = document.getElementById("chart-tab");
  const visualTab = document.getElementById("visual-tab");

  if (isChecked) {
    label.textContent = "Visual 3D"; // Ubah label menjadi "Visual 3D"
    chartTab.classList.add("hidden"); // Sembunyikan tab grafik biasa
    visualTab.classList.remove("hidden"); // Tampilkan tab visual 3D

    // Jika visual tab belum diinisialisasi, inisialisasi plot 3D
    if (!window.visualTabInitialized) {
      initialize3DPlot("leftAccel3D");
      initialize3DPlot("rightAccel3D");
      window.visualTabInitialized = true;
    }
  } else {
    label.textContent = "Visual 3D";
    chartTab.classList.remove("hidden"); // Tampilkan tab grafik biasa
    visualTab.classList.add("hidden"); // Sembunyikan tab visual 3D
  }
});

// Fungsi untuk menangani mode gelap/terang
const darkToggle = document.getElementById("toggle-darkmode");
const root = document.documentElement;

// Memeriksa dan memuat tema yang disimpan di localStorage
const savedTheme = localStorage.getItem("theme");

if (savedTheme === "dark") {
  root.classList.add("dark"); // Terapkan tema gelap
  if (darkToggle) darkToggle.checked = true; // Set checkbox untuk mode gelap aktif
} else {
  root.classList.remove("dark"); // Terapkan tema terang
  if (darkToggle) darkToggle.checked = false; // Set checkbox untuk mode terang aktif
}

// Event listener untuk mengubah mode gelap/terang saat toggle diklik
if (darkToggle) {
  darkToggle.addEventListener("change", () => {
    if (darkToggle.checked) {
      root.classList.add("dark"); // Terapkan tema gelap
      localStorage.setItem("theme", "dark"); // Simpan preferensi tema gelap
    } else {
      root.classList.remove("dark"); // Terapkan tema terang
      localStorage.setItem("theme", "light"); // Simpan preferensi tema terang
    }
  });
} else {
  console.warn("Toggle element not found!"); // Peringatan jika elemen tidak ditemukan
}

// Fungsi untuk membuat grafik
const charts = {
  leftaccel: createChart("accelLeftChart", "red", "green", "blue", -50, 50), // Grafik akselerometer kiri
  leftgyro: createChart("gyroLeftChart", "orange", "purple", "cyan", -10, 10), // Grafik giroskop kiri
  rightaccel: createChart("accelRightChart", "red", "green", "blue", -50, 50), // Grafik akselerometer kanan
  rightgyro: createChart("gyroRightChart", "orange", "purple", "cyan", -10, 10), // Grafik giroskop kanan
};

// Fungsi untuk membuat grafik dengan pengaturan warna dan rentang sumbu Y
function createChart(canvasId, colorX, colorY, colorZ, yMin, yMax) {
  const ctx = document.getElementById(canvasId).getContext("2d"); // Mendapatkan konteks canvas
  const chart = new Chart(ctx, {
    type: "line", // Grafik tipe garis
    data: {
      labels: [], // Label waktu untuk sumbu X
      datasets: [
        { label: "X", data: [], borderColor: colorX, fill: false },
        { label: "Y", data: [], borderColor: colorY, fill: false },
        { label: "Z", data: [], borderColor: colorZ, fill: false },
      ],
    },
    options: {
      responsive: true, // Membuat grafik responsif
      animation: false, // Menonaktifkan animasi
      scales: {
        y: {
          min: yMin, // Nilai minimum pada sumbu Y
          max: yMax, // Nilai maksimum pada sumbu Y
          ticks: { stepSize: (yMax - yMin) / 10 }, // Menentukan jarak antara ticks di sumbu Y
        },
      },
    },
  });
  chart.originalColors = [colorX, colorY, colorZ]; // Menyimpan warna asli untuk referensi
  return chart; // Mengembalikan objek grafik
}

function updateCharts(chart, accelOrGyro, data) {
  const timestamp = new Date().toLocaleTimeString(); // Mendapatkan waktu saat ini
  chart.data.labels.push(timestamp); // Menambahkan label waktu pada grafik
  if (chart.data.labels.length > 20) {
    chart.data.labels.shift(); // Menghapus label pertama jika sudah ada lebih dari 20 label
    chart.data.datasets.forEach((ds) => ds.data.shift()); // Menghapus data pertama jika sudah ada lebih dari 20 data
  }

  // Memperbarui data untuk setiap sumbu X, Y, Z
  ["X", "Y", "Z"].forEach((axis, i) => {
    chart.data.datasets[i].data.push(data[accelOrGyro][i]); // Menambahkan data akselerometer/giroskop untuk sumbu X, Y, Z
    chart.data.datasets[i].borderColor = isRunning
      ? chart.originalColors[i] // Jika sistem berjalan, warna tetap seperti yang diatur sebelumnya
      : "gray"; // Jika sistem tidak berjalan, warna menjadi abu-abu
  });

  chart.update(); // Memperbarui grafik dengan data terbaru
}

function playRandomSound() {
  let lastIndex = -1;
  let randomIndex;

  if (!isSFXEnabled || !isRunning) {
    // Jika SFX dimatikan atau sistem tidak berjalan, tidak perlu memutar suara
    return;
  }

  const mp3Files = [
    "static/sounds/ComboDeadly.mp3",
    "static/sounds/ComboGreatStreak.mp3",
    "static/sounds/ComboImpresive.mp3",
    "static/sounds/ComboNiceMove.mp3",
    "static/sounds/ComboNiceWork.mp3",
  ];

  do {
    randomIndex = Math.floor(Math.random() * mp3Files.length); // Memilih file suara secara acak
  } while (randomIndex === lastIndex && mp3Files.length > 1); // Menghindari pemutaran suara yang sama berturut-turut

  lastIndex = randomIndex;

  const audio = document.getElementById("comboSound");
  audio.src = mp3Files[randomIndex]; // Mengatur sumber suara acak
  audio.volume = audio.play(); // Memutar suara dengan volume 50%
}

async function fetchAndUpdate(endpoint, prefix) {
  if (!isRunning) {
    // Jika sistem tidak berjalan, set warna grafik menjadi abu-abu
    ["accel", "gyro"].forEach((type) => {
      const chart = charts[`${prefix}${type}`];
      chart.data.datasets.forEach((ds) => (ds.borderColor = "gray")); // Set warna dataset menjadi abu-abu
      chart.update(); // Memperbarui grafik dengan warna abu-abu
    });
    return;
  }

  try {
    const res = await fetch(endpoint); // Mengambil data dari server
    const data = await res.json(); // Mengkonversi data ke format JSON
    updateCharts(charts[`${prefix}accel`], "accel", data); // Memperbarui grafik akselerometer
    updateCharts(charts[`${prefix}gyro`], "gyro", data); // Memperbarui grafik giroskop
  } catch (err) {
    console.error(`Fetch error for ${prefix}:`, err); // Menangani error saat pengambilan data
  }
}

function updatePunchDisplay() {
  const box = document.getElementById("punchBox");
  if (punchSequence.length === 0) {
    box.textContent = "NO PUNCH"; // Menampilkan "NO PUNCH" jika tidak ada pukulan
  } else {
    const latest = punchSequence[punchSequence.length - 1]; // Mendapatkan pukulan terakhir
    box.innerHTML = `
          <div class="text-xl">${punchSequence.slice(0, -1).join(" → ")}</div>
          <div class="text-3xl font-bold text-blue-600">${latest}</div>
        `; // Menampilkan urutan pukulan dengan pukulan terakhir lebih besar
  }
}

async function fetchPunchClassification() {
  try {
    const res = await fetch("/last_punch"); // Mengambil data pukulan terakhir dari server
    const punchArray = await res.json(); // Mengkonversi data JSON

    if (punchArray.length > 0) {
      const punchData = punchArray.reduce((latest, current) =>
        new Date(current.timestamp) > new Date(latest.timestamp)
          ? current
          : latest
      ); // Menentukan pukulan terbaru berdasarkan timestamp

      const newTimestamp = new Date(punchData.timestamp).getTime(); // Mendapatkan timestamp baru

      if (
        newTimestamp !== lastPunchTimestamp ||
        punchData.punch_type !== lastPunchType ||
        punchData.device_id !== lastDeviceId
      ) {
        // Jika ada pukulan baru, memperbarui data
        lastPunchTimestamp = newTimestamp;
        lastPunchType = punchData.punch_type;
        lastDeviceId = punchData.device_id;

        // Memperbarui urutan pukulan dan memastikan maksimal 10 pukulan
        punchSequence.push(punchData.punch_type);
        if (punchSequence.length > 10) punchSequence.shift();

        updatePunchDisplay(); // Memperbarui tampilan urutan pukulan
        playPunchSound(punchData.punch_type); // Memainkan suara berdasarkan jenis pukulan

        if (comboTimeout) clearTimeout(comboTimeout); // Menghapus timeout jika ada pukulan baru
        comboTimeout = setTimeout(() => {
          playRandomSound(); // Memutar suara combo setelah 2 detik
          punchSequence = [];
          updatePunchDisplay();
        }, 2000); // Timeout 2 detik setelah pukulan terakhir

        // Memperbarui tabel dengan informasi pukulan terbaru
        const row = document.createElement("tr");
        row.innerHTML = `
              <td class="py-1 px-4 border">${punchData.timestamp}</td>
              <td class="py-1 px-4 border">${punchData.device_id}</td>
              <td class="py-1 px-4 border font-bold text-blue-600">${punchData.punch_type}</td>
            `;

        const table = document.getElementById("punchLogTable");
        if (table.querySelector("td.italic")) table.innerHTML = ""; // Menghapus data lama jika ada
        table.prepend(row); // Menambahkan pukulan baru ke atas tabel
        while (table.rows.length > 10) table.deleteRow(-1); // Menjaga hanya 10 baris terbaru
      }
    }
  } catch (e) {
    console.error("Gagal fetch punch_type:", e); // Menangani error saat mengambil data pukulan
  }
}

function playPunchSound(punchType) {
  if (!isSFXEnabled) return; // Jika efek suara (SFX) dimatikan, tidak memutar suara

  const soundMap = {
    JAB: document.getElementById("jabSound"),
    STRAIGHT: document.getElementById("straightSound"),
    UPPERCUT: document.getElementById("uppercutSound"),
    HOOK: document.getElementById("hookSound"),
  };

  const sound =
    soundMap[punchType.toUpperCase()] || // Pilih suara sesuai dengan jenis pukulan
    document.getElementById("defaultSound"); // Jika jenis pukulan tidak ada, pilih suara default

  if (sound) {
    sound.currentTime = 0; // Mulai suara dari awal
    sound.play().catch((e) => console.log("Sound effect play error:", e)); // Mainkan suara, tangkap error jika ada
  } else {
    console.warn("Punch type tidak dikenal:", punchType); // Jika jenis pukulan tidak ditemukan, tampilkan peringatan
  }
}

setInterval(() => {
  fetchAndUpdate("/data/left", "left");
  fetchAndUpdate("/data/right", "right");

  if (isRunning) {
    fetchPunchClassification(); // Mengambil klasifikasi pukulan jika sistem berjalan

    // Cek jika pukulan sudah terlalu lama, maka tampilkan "NO PUNCH"
    if (Date.now() - lastPunchTimestamp > punchTimeout) {
      punchSequence = []; // Reset urutan pukulan
      updatePunchDisplay(); // Memperbarui tampilan pukulan
    }
  }
}, 100); // Interval pengambilan data setiap 100ms

if (!isRunning) {
  document.getElementById("punchBox").textContent = "NO PUNCH";
}

const toggleButton = document.getElementById("toggleButton");
const statusText = document.getElementById("statusText");
const statusDot = document.querySelector("#statusIndicator span");

toggleButton.addEventListener("click", async () => {
  const status = isRunning ? "off" : "on";

  const sound = isRunning
    ? document.getElementById("stopSound")
    : document.getElementById("startSound");
  sound.currentTime = 0;
  sound.play().catch((err) => console.warn("Audio play error:", err)); // Memutar suara mulai atau berhenti

  const backgroundMusic = document.getElementById("backgroundMusic");

  try {
    await fetch("/mqtt-control", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }), // Mengirim status latihan ke server
    });
  } catch (e) {
    console.error("Failed to send MQTT command", e); // Menangani error pengiriman perintah ke server
  }

  isRunning = !isRunning; // Mengubah status sistem

  if (isRunning && isBacksoundEnabled) {
    setTimeout(() => {
      backgroundMusic.currentTime = 0;
      backgroundMusic
        .play()
        .catch((err) => console.warn("Backsound error:", err)); // Memutar musik latar belakang setelah 2 detik
    }, 2000);
    backgroundMusic.volume = 1; // Set volume musik latar
  } else {
    backgroundMusic.pause(); // Berhentikan musik latar
    backgroundMusic.currentTime = 0; // Set waktu musik ke awal
  }

  // Memperbarui teks dan tampilan tombol berdasarkan status sistem
  toggleButton.textContent = isRunning ? "Akhiri Latihan" : "Mulai Latihan";
  statusText.textContent = isRunning ? "ON" : "OFF";
  toggleButton.classList.toggle("bg-blue-600", isRunning);
  toggleButton.classList.toggle("bg-gray-400", !isRunning);

  statusText.textContent = isRunning ? "ON" : "OFF";
  statusDot.className = `inline-block w-2 h-2 rounded-full mr-1 align-middle ${
    isRunning ? "bg-green-500" : "bg-gray-400"
  }`;
});

document.getElementById("toggle-backsound").addEventListener("change", (e) => {
  isBacksoundEnabled = e.target.checked; // Menyimpan status apakah backsound diaktifkan
  if (!isBacksoundEnabled) {
    backgroundMusic.pause(); // Berhentikan musik latar jika tidak aktif
  }
});

document.getElementById("toggle-sfx").addEventListener("change", (e) => {
  isSFXEnabled = e.target.checked; // Menyimpan status apakah SFX diaktifkan
});

// Toggle backsound
toggleBacksound.addEventListener("change", () => {
  if (toggleBacksound.checked) {
    backgroundMusic.volume = 0.2;
    backgroundMusic
      .play()
      .catch((e) => console.log("Backsound play error:", e));
  } else {
    backgroundMusic.pause();
  }
});

// Toggle SFX
toggleSFX.addEventListener("change", () => {
  isSFXEnabled = toggleSFX.checked;
});

// Fungsi untuk menginisialisasi plot 3D
function initialize3DPlot(id) {
  Plotly.newPlot(
    id,
    [
      {
        type: "scatter3d", // Tipe plot 3D
        mode: "lines+markers",
        x: [[]], // Data kosong untuk sumbu X
        y: [[]], // Data kosong untuk sumbu Y
        z: [[]], // Data kosong untuk sumbu Z
        name: "Accel Data", // Nama data
        marker: {
          size: 4,
          color: id.includes("left") ? "red" : "blue", // Warna marker tergantung sisi (kiri/kanan)
        },
        line: {
          width: 4,
          color: id.includes("left") ? "red" : "blue", // Warna garis tergantung sisi (kiri/kanan)
        },
      },
    ],
    {
      responsive: false,
      margin: { l: 0, r: 0, b: 0, t: 0 },
      scene: {
        xaxis: { range: [-50, 50] }, // Rentang sumbu X
        yaxis: { range: [-50, 50] }, // Rentang sumbu Y
        zaxis: { range: [-50, 50] }, // Rentang sumbu Z
      },
    }
  );
}

function updateOrientation(side, gyro, dt = 0.016) {
  const ori = imu_orientation[side];
  ori.roll += gyro[0] * dt;
  ori.pitch += gyro[1] * dt;
  ori.yaw += gyro[2] * dt;
}

function updateOrientation(side, gyro, dt = 0.016) {
  const ori = imu_orientation[side];
  ori.roll += gyro[0] * dt; // Memperbarui roll berdasarkan data giroskop
  ori.pitch += gyro[1] * dt; // Memperbarui pitch berdasarkan data giroskop
  ori.yaw += gyro[2] * dt; // Memperbarui yaw berdasarkan data giroskop
}

function rotateAccelToGlobal(accel, ori) {
  const toRad = (deg) => deg * (Math.PI / 180); // Mengonversi derajat ke radian

  const roll = toRad(ori.roll);
  const pitch = toRad(ori.pitch);
  const yaw = toRad(ori.yaw);

  // Matriks rotasi (Urutan Yaw-Pitch-Roll)
  const cy = Math.cos(yaw),
    sy = Math.sin(yaw);
  const cp = Math.cos(pitch),
    sp = Math.sin(pitch);
  const cr = Math.cos(roll),
    sr = Math.sin(roll);

  const R = [
    [cy * cp, cy * sp * sr - sy * cr, cy * sp * cr + sy * sr],
    [sy * cp, sy * sp * sr + cy * cr, sy * sp * cr - cy * sr],
    [-sp, cp * sr, cp * cr],
  ];

  const [ax, ay, az] = accel;

  const gx = R[0][0] * ax + R[0][1] * ay + R[0][2] * az;
  const gy = R[1][0] * ax + R[1][1] * ay + R[1][2] * az;
  const gz = R[2][0] * ax + R[2][1] * ay + R[2][2] * az;

  return [gx, gy, gz]; // Mengembalikan vektor akselerasi yang sudah diputar
}

// Fungsi untuk memperbarui plot 3D dengan data akselerometer baru
function updateAccel3D(side, data) {
  const plotId = `${side}Accel3D`;
  if (!data || !data.accel || !data.gyro) return;

  // Step 1: Update orientation
  updateOrientation(side, data.gyro); // assumes ~16ms per update

  // Step 2: Rotate accel vector to global frame
  let accelGlobal = rotateAccelToGlobal(data.accel, imu_orientation[side]);

  // Step 3: Append to plot
  Plotly.extendTraces(
    plotId,
    {
      x: [[accelGlobal[0]]],
      y: [[accelGlobal[1]]],
      z: [[accelGlobal[2]]],
    },
    [0],
    10
  );
}

// Fungsi untuk mengambil data accelerometer dari server
async function fetchAccelData() {
  try {
    const responseLeft = await fetch("/data/left");
    const dataLeft = await responseLeft.json();
    const responseRight = await fetch("/data/right");
    const dataRight = await responseRight.json();

    // console.log("Data imu kiri:", dataLeft);
    // console.log("Data imu kanan:", dataRight);

    // Pastikan data valid sebelum update grafik 3D
    if (isRunning && dataLeft.accel && dataRight.accel) {
      updateAccel3D("left", dataLeft);
      updateAccel3D("right", dataRight);

      // Tambahkan pembaruan grafik untuk akselerometer dan giroskop
      updateCharts(charts["leftaccel"], "accel", dataLeft);
      updateCharts(charts["leftgyro"], "gyro", dataLeft);
      updateCharts(charts["rightaccel"], "accel", dataRight);
      updateCharts(charts["rightgyro"], "gyro", dataRight);
    }
  } catch (error) {
    console.error("Error fetching accelerometer data:", error);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initialize3DPlot("leftAccel3D");
  initialize3DPlot("rightAccel3D");
  console.log("Inisialisasi 3D selesai.");
});

setInterval(fetchAccelData, 50);
