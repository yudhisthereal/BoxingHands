import sqlite3

def confirm_input(prompt):
    response = input(prompt + " (yes/no): ").strip().lower()
    return response == 'yes'

def main():
    print("⚠️ PERINGATAN: Anda akan menghapus semua data dari database.")
    if not confirm_input("Apakah Anda yakin ingin melanjutkan?"):
        print("Operasi dibatalkan.")
        return
    if not confirm_input("Konfirmasi kedua: Tindakan ini tidak dapat dibatalkan. Yakin?"):
        print("Operasi dibatalkan.")
        return

    try:
        conn = sqlite3.connect("punch_data.db")  # Ganti dengan nama database Anda
        cursor = conn.cursor()
        cursor.execute("DELETE FROM device_left")  # Ganti dengan nama tabel Anda
        cursor.execute("DELETE FROM device_right")
        cursor.execute("DELETE FROM sqlite_sequence")
        cursor.execute("DELETE FROM last_punch")
        cursor.execute("DELETE FROM punch_log")
        conn.commit()
        print("✅ Semua data berhasil dihapus dari database.")
    except Exception as e:
        print("❌ Terjadi kesalahan:", e)
    finally:
        conn.close()

if __name__ == "__main__":
    main()
