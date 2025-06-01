let isRunning = false;
let lastPunchTimestamp = 0;
const punchTimeout = 2000;
let punchHistory = [];
let lastPunchType = "";
let lastDeviceId = "";
let punchSequence = [];
let comboTimeout = null;

// Initialize orientation
const imu_orientation = {
  left: { roll: 0, pitch: 0, yaw: 0 },
  right: { roll: 0, pitch: 0, yaw: 0 },
};


const toggleBacksound = document.getElementById("toggle-backsound");
const toggleSFX = document.getElementById("toggle-sfx");

const backgroundMusic = document.getElementById("backgroundMusic");
let isSFXEnabled = true;
let isBacksoundEnabled = true;

const accel3DHistory = {
  left: { x: [], y: [], z: [] },
  right: { x: [], y: [], z: [] },
};

// Auto toggle label & tab
document.getElementById("graphToggle").addEventListener("change", function () {
  const isChecked = this.checked;
  const label = document.getElementById("graphToggleLabel");
  const chartTab = document.getElementById("chart-tab");
  const visualTab = document.getElementById("visual-tab");

  if (isChecked) {
    label.textContent = "Visual 3D";
    chartTab.classList.add("hidden");
    visualTab.classList.remove("hidden");

    if (!window.visualTabInitialized) {
      initialize3DPlot("leftAccel3D");
      initialize3DPlot("rightAccel3D");
      window.visualTabInitialized = true;
    }
  } else {
    label.textContent = "Visual 3D";
    chartTab.classList.remove("hidden");
    visualTab.classList.add("hidden");
  }
});

// Dark mode functionality
const darkToggle = document.getElementById("toggle-darkmode");
const root = document.documentElement;

console.log("Dark toggle element:", darkToggle);

// Load saved theme or default to light
const savedTheme = localStorage.getItem("theme");
console.log("Saved theme from localStorage:", savedTheme);

if (savedTheme === "dark") {
  console.log("Applying dark mode from saved theme.");
  root.classList.add("dark");
  if (darkToggle) darkToggle.checked = true;
} else {
  console.log("Applying light mode from saved theme or default.");
  root.classList.remove("dark");
  if (darkToggle) darkToggle.checked = false;
}

// On toggle click
if (darkToggle) {
  darkToggle.addEventListener("change", () => {
    if (darkToggle.checked) {
      console.log("Toggle switched to dark mode.");
      root.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      console.log("Toggle switched to light mode.");
      root.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  });
} else {
  console.warn("Toggle element not found!");
}


const charts = {
  leftaccel: createChart("accelLeftChart", "red", "green", "blue", -50, 50),
  leftgyro: createChart("gyroLeftChart", "orange", "purple", "cyan", -10, 10),
  rightaccel: createChart("accelRightChart", "red", "green", "blue", -50, 50),
  rightgyro: createChart("gyroRightChart", "orange", "purple", "cyan", -10, 10),
};

function createChart(canvasId, colorX, colorY, colorZ, yMin, yMax) {
  const ctx = document.getElementById(canvasId).getContext("2d");
  const chart = new Chart(ctx, {
    type: "line",
    data: {
      labels: [],
      datasets: [
        { label: "X", data: [], borderColor: colorX, fill: false },
        { label: "Y", data: [], borderColor: colorY, fill: false },
        { label: "Z", data: [], borderColor: colorZ, fill: false },
      ],
    },
    options: {
      responsive: true,
      animation: false,
      scales: {
        y: {
          min: yMin,
          max: yMax,
          ticks: { stepSize: (yMax - yMin) / 10 },
        },
      },
    },
  });
  chart.originalColors = [colorX, colorY, colorZ];
  return chart;
}

function updateCharts(chart, accelOrGyro, data) {
  const timestamp = new Date().toLocaleTimeString();
  chart.data.labels.push(timestamp);
  if (chart.data.labels.length > 20) {
    chart.data.labels.shift();
    chart.data.datasets.forEach((ds) => ds.data.shift());
  }

  ["X", "Y", "Z"].forEach((axis, i) => {
    chart.data.datasets[i].data.push(data[accelOrGyro][i]);
    chart.data.datasets[i].borderColor = isRunning
      ? chart.originalColors[i]
      : "gray";
  });

  chart.update();
}

function playRandomSound() {
  let lastIndex = -1;
  let randomIndex;

  if (!isSFXEnabled || !isRunning) {
    // Jika SFX dimatikan, jangan putar suara
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
    randomIndex = Math.floor(Math.random() * mp3Files.length);
  } while (randomIndex === lastIndex && mp3Files.length > 1);

  lastIndex = randomIndex;

  const audio = document.getElementById("comboSound");
  audio.src = mp3Files[randomIndex];
  audio.volume = audio.play(); //0.5; play 50%
}

async function fetchAndUpdate(endpoint, prefix) {
  if (!isRunning) {
    ["accel", "gyro"].forEach((type) => {
      const chart = charts[`${prefix}${type}`];
      chart.data.datasets.forEach((ds) => (ds.borderColor = "gray"));
      chart.update();
    });
    return;
  }

  try {
    const res = await fetch(endpoint);
    const data = await res.json();
    updateCharts(charts[`${prefix}accel`], "accel", data);
    updateCharts(charts[`${prefix}gyro`], "gyro", data);
  } catch (err) {
    console.error(`Fetch error for ${prefix}:`, err);
  }
}

function updatePunchDisplay() {
  const box = document.getElementById("punchBox");
  if (punchSequence.length === 0) {
    box.textContent = "NO PUNCH";
  } else {
    const latest = punchSequence[punchSequence.length - 1];
    box.innerHTML = `
          <div class="text-xl">${punchSequence.slice(0, -1).join(" → ")}</div>
          <div class="text-3xl font-bold text-blue-600">${latest}</div>
        `;
  }
}

async function fetchPunchClassification() {
  try {
    const res = await fetch("/last_punch");
    const punchArray = await res.json();

    if (punchArray.length > 0) {
      const punchData = punchArray.reduce((latest, current) =>
        new Date(current.timestamp) > new Date(latest.timestamp)
          ? current
          : latest
      );

      const newTimestamp = new Date(punchData.timestamp).getTime();

      if (
        newTimestamp !== lastPunchTimestamp ||
        punchData.punch_type !== lastPunchType ||
        punchData.device_id !== lastDeviceId
      ) {
        lastPunchTimestamp = newTimestamp;
        lastPunchType = punchData.punch_type;
        lastDeviceId = punchData.device_id;

        // Update sequence and trim to max 10
        punchSequence.push(punchData.punch_type);
        if (punchSequence.length > 10) punchSequence.shift();

        updatePunchDisplay();
        playPunchSound(punchData.punch_type);

        if (comboTimeout) clearTimeout(comboTimeout);
        comboTimeout = setTimeout(() => {
          playRandomSound();
          punchSequence = [];
          updatePunchDisplay();
        }, 2000); // waktu tunggu 2 detik setelah pukulan terakhir

        // Update table
        const row = document.createElement("tr");
        row.innerHTML = `
              <td class="py-1 px-4 border">${punchData.timestamp}</td>
              <td class="py-1 px-4 border">${punchData.device_id}</td>
              <td class="py-1 px-4 border font-bold text-blue-600">${punchData.punch_type}</td>
            `;

        const table = document.getElementById("punchLogTable");
        if (table.querySelector("td.italic")) table.innerHTML = "";
        table.prepend(row);
        while (table.rows.length > 10) table.deleteRow(-1);
      }
    }
  } catch (e) {
    console.error("Gagal fetch punch_type:", e);
  }
}

function playPunchSound(punchType) {
  if (!isSFXEnabled) return;

  const soundMap = {
    JAB: document.getElementById("jabSound"),
    STRAIGHT: document.getElementById("straightSound"),
    UPPERCUT: document.getElementById("uppercutSound"),
    HOOK: document.getElementById("hookSound"),
  };

  const sound =
    soundMap[punchType.toUpperCase()] ||
    document.getElementById("defaultSound");

  if (sound) {
    sound.currentTime = 0;
    sound.play().catch((e) => console.log("Sound effect play error:", e));
  } else {
    console.warn("Punch type tidak dikenal:", punchType);
  }
}

setInterval(() => {
  fetchAndUpdate("/data/left", "left");
  fetchAndUpdate("/data/right", "right");

  if (isRunning) {
    fetchPunchClassification();

    // Check if punch is too old, then show "NO PUNCH"
    if (Date.now() - lastPunchTimestamp > punchTimeout) {
      punchSequence = [];
      updatePunchDisplay();
    }
  }
}, 100);

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
  sound.play().catch((err) => console.warn("Audio play error:", err));

  const backgroundMusic = document.getElementById("backgroundMusic");

  try {
    await fetch("/mqtt-control", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
  } catch (e) {
    console.error("Failed to send MQTT command", e);
  }

  isRunning = !isRunning;

  if (isRunning && isBacksoundEnabled) {
    setTimeout(() => {
      backgroundMusic.currentTime = 0;
      backgroundMusic
        .play()
        .catch((err) => console.warn("Backsound error:", err));
    }, 2000);
    backgroundMusic.volume = 0.2; // 20% volume
  } else {
    backgroundMusic.pause();
    backgroundMusic.currentTime = 0;
  }

  toggleButton.textContent = isRunning ? "Akhiri Latihan" : "Mulai Latihan";
  statusText.textContent = isRunning ? "ON" : "OFF";
  toggleButton.classList.toggle("bg-blue-600", isRunning);
  toggleButton.classList.toggle("bg-gray-400", !isRunning);

  statusText.textContent = isRunning ? "ON" : "OFF";
  statusDot.className = `inline-block w-2 h-2 rounded-full mr-1 align-middle ${isRunning ? "bg-green-500" : "bg-gray-400"
    }`;
});

document.getElementById("toggle-backsound").addEventListener("change", (e) => {
  isBacksoundEnabled = e.target.checked;
  if (!isBacksoundEnabled) {
    backgroundMusic.pause();
  }
});

document.getElementById("toggle-sfx").addEventListener("change", (e) => {
  isSFXEnabled = e.target.checked;
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
        type: "scatter3d",
        mode: "lines+markers",
        x: [[]], // empty trace
        y: [[]],
        z: [[]],
        name: "Accel Data",
        marker: {
          size: 4,
          color: id.includes("left") ? "red" : "blue",
        },
        line: {
          width: 4,
          color: id.includes("left") ? "red" : "blue",
        },
      },
    ],
    {
      responsive: false,
      margin: { l: 0, r: 0, b: 0, t: 0 },
      scene: {
        xaxis: { range: [-50, 50] },
        yaxis: { range: [-50, 50] },
        zaxis: { range: [-50, 50] },
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

function rotateAccelToGlobal(accel, ori) {
  const toRad = (deg) => deg * (Math.PI / 180);

  const roll = toRad(ori.roll);
  const pitch = toRad(ori.pitch);
  const yaw = toRad(ori.yaw);

  // Build rotation matrix (Yaw-Pitch-Roll order)
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const cr = Math.cos(roll), sr = Math.sin(roll);

  const R = [
    [cy * cp, cy * sp * sr - sy * cr, cy * sp * cr + sy * sr],
    [sy * cp, sy * sp * sr + cy * cr, sy * sp * cr - cy * sr],
    [-sp, cp * sr, cp * cr],
  ];

  const [ax, ay, az] = accel;

  const gx = R[0][0] * ax + R[0][1] * ay + R[0][2] * az;
  const gy = R[1][0] * ax + R[1][1] * ay + R[1][2] * az;
  const gz = R[2][0] * ax + R[2][1] * ay + R[2][2] * az;

  return [gx, gy, gz];
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
