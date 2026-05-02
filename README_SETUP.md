# HITL Mirror Setup Guide

Tài liệu hướng dẫn chi tiết cách thiết lập môi trường để vận hành hệ thống HITL Mirror Professional Edition.

## Prerequisites

- Python 3.11+ (Đảm bảo đã thêm vào PATH)
- Node.js 18+
- A Google API key
- Windows OS (hệ thống hiện tại được tối ưu hóa cho Windows)

## 1. Quick Start

Hệ thống tích hợp sẵn script tự động hóa toàn bộ quy trình.

1. **Cấu hình API**: Mở file `backend/.env` (hoặc tạo mới từ `.env.example`) và điền key:
   ```env
   GOOGLE_API_KEY=your_gemini_api_key_here
   GEMINI_MODEL=gemini-3-flash-preview
   ```

2. **Kích hoạt**: Tại thư mục gốc dự án, chạy lệnh:
   ```powershell
   npm run dev
   ```

Lệnh này sẽ khởi động đồng thời backend FastAPI (port 8000, `DEV_MODE=1`) và frontend Vite (port 3000).

## 2. Backend (Manual Setup)

Nếu bạn muốn kiểm soát từng bước hoặc gỡ lỗi phần Backend:

```powershell
cd backend
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Required env vars

- `GOOGLE_API_KEY` — API key Google AI Studio của bạn.
- `GEMINI_MODEL` — mặc định dùng `gemini-3-flash-preview`, tự động fallback xuống model khác khi quota cạn.

## 3. Frontend (Manual Setup)

Nếu bạn muốn kiểm soát từng bước phần Frontend:

```powershell
cd frontend
npm install
npm run dev
```

App: http://localhost:3000

## 4. Memory Architecture

Hệ thống sử dụng cơ chế Dual-Storage để hiện thực hóa Human-in-the-loop:

- **SQLite (`hitl_mirror.db`)**: Lưu trữ thông tin định danh bài làm, điểm số và các chuỗi chấm điểm.
- **ChromaDB (Vector DB)**: Lưu trữ và chỉ mục hóa nhận xét của giáo viên. Thực hiện truy vấn ngữ nghĩa (Semantic Search) để tìm bài học liên quan khi chấm bài mới.

**Lưu ý:** ChromaDB yêu cầu một số thư viện hệ thống để build. Nếu gặp lỗi khi cài đặt `chromadb`, hãy đảm bảo bạn đã cài đặt Microsoft C++ Build Tools.

## 5. Troubleshooting

- **Lỗi 429 (Resource Exhausted)**: Do API Gemini bị giới hạn quota. Hệ thống sẽ tự động xoay vòng model hoặc thử lại sau vài giây.
- **Lỗi Transcript bị cắt cụt**: Hệ thống đã nâng cấp `max_output_tokens` lên 16,384. Nếu vẫn bị cắt, hãy kiểm tra xem bài làm có quá dài hay không.
- **Lỗi Port 8000/3000**: Nếu bị chiếm dụng, hãy chạy script sau trong PowerShell (Admin):
  ```powershell
  Stop-Process -Id (Get-NetTCPConnection -LocalPort 8000).OwningProcess -Force
  Stop-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess -Force
  ```
- **Lỗi Heartbeat**: Nếu Backend tự đóng ngay khi vừa mở, hãy kiểm tra xem Frontend đã được khởi động đúng chưa. Backend sẽ tự tắt nếu không nhận được signal từ trình duyệt sau 30-60 giây.
