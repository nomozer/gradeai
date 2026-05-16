# HITL Mirror

Hệ thống hỗ trợ chấm điểm tự luận thông minh (Human-in-the-loop VLM Grading Agent) được xây dựng với React/Vite và FastAPI. Tải lên bài làm của học sinh, để AI phân tích, sau đó giáo viên kiểm duyệt kết quả và tinh chỉnh bộ quy tắc chấm điểm của AI thông qua RAG.

## Stack

- **Frontend** — React 18 + Vite + TypeScript
- **Backend** — Python 3.11+ + FastAPI
- **Storage** — SQLite (lưu trữ thông tin bài làm, điểm số) + ChromaDB (vector index cho RAG)
- **RAG** — Google Gemini API (`gemini-3-flash-preview` / `gemini-1.5-pro`)
- **Processing** — PyMuPDF + Pillow để xử lý hình ảnh và trích xuất PDF

## Project layout

```text
hitl-mirror/
├── backend/          FastAPI app, RAG, ChromaDB, logic chấm điểm
├── frontend/         Vite + React UI
├── scripts/          Các script tự động hóa
└── package.json      Package gốc để chạy script khởi động
```

## Prerequisites

- Python 3.11+ (đảm bảo đã thêm vào PATH)
- Node.js 18+
- A Google API key (lấy tại https://aistudio.google.com/app/apikey)
- Windows OS (khuyên dùng)

## 1. Quick Start

Để khởi chạy toàn bộ hệ thống (cả backend và frontend) cùng lúc bằng script tự động:

1. **Cấu hình API**: Mở `backend/.env` (hoặc tạo mới) và điền key:
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

# Tạo file backend/.env và điền GOOGLE_API_KEY

uvicorn main:app --reload --port 8000
```

API docs: http://localhost:8000/docs

### Required env vars

File `backend/.env` cần các biến môi trường sau:

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

## 4. Using the app

1. Mở giao diện frontend, tải lên tệp PDF hoặc hình ảnh bài làm của học sinh.
2. Chờ AI phân tích bài làm và tạo bản sao chép (Transcript).
3. Xem lại bản sao chép, điểm số và nhận xét do AI đề xuất.
4. Chỉnh sửa điểm số hoặc thêm phản hồi để dạy cho AI (quy trình Human-in-the-loop).
5. Lưu kết quả để hệ thống cập nhật vào bộ nhớ RAG, giúp AI học hỏi phong cách chấm bài của bạn.

## 5. Memory Architecture

Hệ thống sử dụng cơ chế Dual-Storage để hiện thực hóa Human-in-the-loop:

- **SQLite (`hitl_mirror.db`)**: Lưu trữ thông tin định danh bài làm, điểm số và các chuỗi chấm điểm.
- **ChromaDB (Vector DB)**: Lưu trữ và chỉ mục hóa nhận xét của giáo viên. Thực hiện truy vấn ngữ nghĩa (Semantic Search) để tìm bài học liên quan khi chấm bài mới.

**Lưu ý:** ChromaDB yêu cầu một số thư viện hệ thống để build. Nếu gặp lỗi khi cài đặt `chromadb`, hãy đảm bảo bạn đã cài đặt Microsoft C++ Build Tools.

## 6. Architecture Highlights

- **Đa môn học STEM:** Hệ thống tự động nhận diện môn học dựa trên từ khóa để áp dụng quy tắc chấm điểm phù hợp.
- **Thị giác máy tính (VLM):** Hiểu được bố cục, nét gạch xóa và ký hiệu toán học phức tạp trực tiếp từ hình ảnh/PDF mà không dùng OCR truyền thống.
- **Đối soát nguyên văn (Transparent Transcript):** Bắt buộc AI chép lại y hệt bài làm của học sinh, tạo ra bằng chứng đối soát minh bạch.
- **Ưu tiên phản hồi (Feedback Priority):** Các bài học trong Vector DB được ưu tiên dựa trên đánh giá của giáo viên, đảm bảo AI không lặp lại lỗi đã bị bác bỏ.

## 7. Troubleshooting

- **Lỗi 429 (Resource Exhausted)**: Do API Gemini bị giới hạn quota. Hệ thống sẽ tự động xoay vòng model hoặc thử lại sau vài giây.
- **Lỗi Transcript bị cắt cụt**: Hệ thống đã nâng cấp `max_output_tokens` lên 32,768. Nếu vẫn bị cắt, hãy kiểm tra xem bài làm có quá dài hay không.
- **Lỗi Port 8000/3000**: Nếu bị chiếm dụng, hãy chạy script sau trong PowerShell (Admin):
  ```powershell
  Stop-Process -Id (Get-NetTCPConnection -LocalPort 8000).OwningProcess -Force
  Stop-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess -Force
  ```
  Hoặc đơn giản hơn: chạy lại `npm run dev` — script tự động dọn port đang bị giữ trước khi khởi động.
- **Lỗi Heartbeat**: Nếu Backend tự đóng ngay khi vừa mở (ngoài `DEV_MODE`), hãy kiểm tra xem Frontend đã được khởi động đúng chưa. Backend sẽ tự tắt nếu không nhận được signal từ trình duyệt sau `HEARTBEAT_TIMEOUT` giây (mặc định 90s).
