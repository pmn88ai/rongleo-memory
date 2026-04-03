🧠 Memory App — Ký Ức Cuộc Đời

Một web app cá nhân để lưu, kết nối và khám phá ký ức theo cách tự nhiên như cách não hoạt động: rời rạc nhưng có liên kết.

🚀 Tính năng chính
✍️ Ghi nhanh ký ức
Nhập nội dung tự do
Thêm:
📅 Ngày / năm
🏷 Tag
😊 Cảm xúc
🧑‍🤝‍🧑 Người liên quan
💡 Bài học
🎲 Gợi nhớ ngẫu nhiên
1 click → hiện 1 ký ức bất kỳ
Dùng để “đào lại quá khứ” bất chợt
🔍 AI Search (GROQ)
Tìm bằng ngôn ngữ tự nhiên:
“kỷ niệm với mẹ”
“lúc tao thất bại”
AI parse → keywords + người + cảm xúc → search thông minh
🧑‍🤝‍🧑 Liên kết Contacts
Dùng lại bảng contacts từ app cũ
Gắn người vào ký ức
Click 1 người → xem toàn bộ ký ức liên quan
📊 Filter & Explore
Lọc theo:
tag
cảm xúc
người
🌙 Dark mode
Toggle
Lưu tự động
💾 Sync + Fallback
Supabase → sync đa thiết bị
Nếu lỗi → fallback localStorage
📤 Export / 📥 Import
Backup toàn bộ data JSON
Import có confirm
🏗 Kiến trúc

Không framework. Không build. Không npm.

index.html  → UI + layout
app.js      → toàn bộ logic

Tech:

HTML + CSS + Vanilla JS
Supabase (DB + sync)
GROQ (AI)
⚙️ Cấu hình

Vào Cài đặt trong app, nhập:

SUPABASE_URL
SUPABASE_ANON_KEY
GROQ_API_KEY
CONTACTS_APP_ID (id_app của contacts app cũ)

👉 Tất cả lưu localStorage
👉 Không hardcode key trong code

🗄 Database
Table: memories
id (uuid)
id_user
id_app
content
memory_date
memory_year
emotions (text[])
tags (text[])
lesson
related_people_ids (uuid[])
created_at
Table: contacts (reuse)
Dùng từ app cũ
Không tạo mới
🧠 Logic quan trọng
🔗 Contacts linkage
Nếu có CONTACTS_APP_ID:
→ filter theo id_app đó
Nếu KHÔNG:
→ lấy toàn bộ contacts theo id_user

👉 Memory app nhìn toàn bộ network, không bị giới hạn app

🔍 Search scoring
score =
  keyword_match × 1 +
  tag_match × 2 +
  emotion_match × 2 +
  person_match × 5

👉 Ưu tiên người > cảm xúc > nội dung

🧼 Data safety
Auto loại bỏ contact đã xoá (ghost data)
Không overwrite nhầm app khác
Luôn filter theo:
id_user
id_app
🚀 Deploy
Vercel (cách nhanh nhất)
Tạo folder:
memory-app/
  ├── index.html
  └── app.js
Drag & drop lên Vercel

👉 Xong. Không cần build.

⚠️ Lưu ý
App cá nhân → không cần login
localStorage giới hạn ~5MB → nên dùng Supabase
AI search là heuristic (không vector DB)
🧠 Triết lý

Đây không phải app ghi chép.
Đây là công cụ để hiểu lại cuộc đời mình.

Ký ức không theo thứ tự
Con người là trung tâm của mọi ký ức
AI chỉ hỗ trợ, không thay thế
🔮 Hướng phát triển (optional)
🌌 Memory Graph (network visualization)
📊 Insight:
Ai ảnh hưởng nhiều nhất
Cảm xúc theo từng người
🎙 Voice input
📸 Ảnh + media
🧩 Tóm lại

Một “bản đồ ký ức cá nhân”
nơi mỗi kỷ niệm là một điểm sáng,
và các mối quan hệ là những đường nối vô hình.