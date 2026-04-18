# ⚙️ HITL Mirror — Hướng dẫn cài đặt kỹ thuật (Technical Setup)

Tài liệu này hướng dẫn chi tiết cách thiết lập môi trường để vận hành hệ thống **HITL Mirror Professional Edition**.

---

## 📋 Yêu cầu hệ thống (Prerequisites)

- **Python 3.11+**: Đảm bảo đã thêm vào PATH.
- **Node.js 18+**: Yêu cầu để vận hành giao diện React chuyên nghiệp.
- **Google Gemini API Key**: Yêu cầu mô hình **Gemini 1.5 Flash** (hoặc Pro). Hệ thống đã được cấu hình tối ưu để tận dụng Context Window lớn và giới hạn đầu ra **16,384 tokens**.
- **Windows OS**: Hệ thống hiện tại được tối ưu hóa cho Windows (sử dụng `.bat` và `taskkill`).

---

## ⚡ 1. Khởi chạy nhanh (Recommended)

Hệ thống tích hợp sẵn script tự động hóa toàn bộ quy trình:

1.  **Cấu hình API**: Mở file `backend/.env` (hoặc tạo mới từ `.env.example`) và điền key:
    ```env
    GOOGLE_API_KEY=your_gemini_api_key_here
    GEMINI_MODEL=gemini-3-flash-preview
    ```
2.  **Kích hoạt**: Chạy file `start.bat` tại thư mục gốc bằng cách click đúp.

_Hệ thống sẽ tự động: Tạo venv -> Cài đặt dependencies (Backend & Frontend) -> Khởi động server -> Mở trình duyệt._

---

## 🛠️ 2. Thiết lập thủ công (Manual Setup)

Nếu bạn muốn kiểm soát từng bước hoặc gỡ lỗi:

### Bước 2.1: Backend (FastAPI + RAG)

```powershell
cd backend
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Bước 2.2: Frontend (React + Stitch)

```powershell
cd frontend
npm install
npm start
```

---

## 🧠 3. Ghi chú về Kiến trúc Bộ nhớ

Hệ thống sử dụng cơ chế **Dual-Storage** để hiện thực hóa Human-in-the-loop:

- **SQLite (`hitl_mirror.db`)**: Lưu trữ thông tin định danh bài làm, điểm số và các chuỗi chấm điểm (Pipeline Runs).
- **ChromaDB (Vector DB)**: Lưu trữ và chỉ mục hóa nhận xét của giáo viên. Khi chấm bài mới, hệ thống sẽ thực hiện truy vấn ngữ nghĩa (Semantic Search) để tìm bài học liên quan.

> [!NOTE]
> ChromaDB yêu cầu một số thư viện hệ thống để build indices. Nếu gặp lỗi khi cài đặt `chromadb`, hãy đảm bảo bạn đã cài đặt **Microsoft C++ Build Tools**.

---

## 🔍 4. Xử lý sự cố (Troubleshooting)

- **Lỗi 429 (Resource Exhausted)**: Do API Gemini bị giới hạn quota. Hệ thống sẽ tự động xoay vòng model hoặc thử lại sau vài giây.
- **Lỗi Transcript bị cắt cụt**: Hệ thống đã nâng cấp `max_output_tokens` lên **16,384**. Nếu vẫn bị cắt, hãy kiểm tra xem bài làm có quá dài (vượt quá 50 trang) hay không và liên hệ quản trị viên.
- **Lỗi Port 8000/3000**: Nếu bị chiếm dụng, hãy chạy script sau trong PowerShell (Admin):
  ```powershell
  Stop-Process -Id (Get-NetTCPConnection -LocalPort 8000).OwningProcess -Force
  Stop-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess -Force
  ```
- **Lỗi Heartbeat**: Nếu Backend tự đóng ngay khi vừa mở, hãy kiểm tra xem Frontend đã được khởi động đúng chưa. Backend sẽ tự tắt nếu không nhận được signal từ trình duyệt sau 30-60 giây.

---

_Tài liệu hướng dẫn vận hành kỹ thuật — Đội ngũ phát triển GradeAI._
