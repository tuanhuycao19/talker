# Talker – Hươu cao cổ 3D biết nói 🦒

Web app hiển thị một chú hươu cao cổ 3D (dựng bằng Three.js, phong cách đồ chơi nhựa), có thể
ghi âm giọng nói của bạn rồi "nói lại" với chuyển động miệng, đầu, tai, mắt khớp theo giọng.

## Tính năng

- **Ghi âm**: nhấn *Ghi âm* để bắt đầu (tối đa 60 giây), trong lúc ghi hươu nghiêng đầu lắng nghe,
  tai vểnh theo âm lượng micro. Nhấn *Dừng* để kết thúc.
- **Phân tích audio → chuyển động** (chạy hoàn toàn trên trình duyệt, `src/analysis.js`):
  - Đưa audio về mono 16 kHz, tách 60 khung/giây; đo độ to (RMS), năng lượng theo dải tần và cao độ
    (tự tương quan qua FFT).
  - **Miệng**: độ mở hàm theo độ to (mở nhanh, khép chậm), âm vô thanh/âm xì mở ít hơn; hình miệng
    dẹt/tròn theo tỉ lệ năng lượng dải 900–2600 Hz so với 150–900 Hz (gần với formant F2 của nguyên âm).
    Hình đi trước tiếng ~30 ms như hoạt hình chuyên nghiệp.
  - **Đầu**: gật theo các điểm nhấn âm tiết (lò xo tắt dần), ngẩng lên khi giọng cao, xoay/nghiêng
    đổi hướng theo từng câu (câu được tách bằng khoảng lặng).
  - **Tai, mắt, thân, đuôi**: tai vểnh khi nói, giật nhẹ ở âm nhấn mạnh; mắt mở to khi cao giọng,
    chớp ở đầu/cuối câu và ngẫu nhiên; thân nhún theo nhịp; đuôi vẫy theo năng lượng giọng.
- **Phát lại**: phát âm thanh và chạy chuyển động đồng bộ theo đồng hồ của Web Audio (có bù độ trễ đầu ra).
  Dòng thời gian hiển thị dạng sóng, đường độ mở miệng, các điểm nhấn âm và câu; bấm vào để tua.
  Có thể chọn giọng cao/trầm (đổi tốc độ phát, chuyển động tự khớp theo).
- **Ảnh nền**: 6 nền dựng sẵn (Studio, Thảo nguyên, Bầu trời, Rừng xanh, Đêm sao, Kẹo ngọt), tải ảnh
  của bạn lên, hoặc chọn màu trơn. Lựa chọn được lưu lại cho lần sau.
- **Video TikTok**: dán link (vd. `https://vt.tiktok.com/ZSbnqN2Gm/`) rồi bấm *Lấy video*. Video được dùng làm
  nền, âm thanh của video được phân tích để hươu "nói" theo; khi *Phát lại*, video nền chạy đồng bộ với tiếng.
  Nếu sau đó bạn ghi âm giọng mới, video vẫn làm nền (chạy lặp, tắt tiếng).
- **Xuất video**: ghép ảnh nền (hoặc video nền), chú hươu 3D và âm thanh thành một file video để tải về hoặc chia sẻ.
  Chọn khung dọc 9:16 (720×1280), ngang 16:9 (1280×720) hoặc vuông (1080×1080). Video được ghi theo thời gian
  thực trong lúc hươu phát lại, nên cần giữ màn hình sáng. Định dạng tuỳ trình duyệt: MP4 (Safari, Chrome mới) hoặc WebM.
- Mở file âm thanh **hoặc video** có sẵn (video sẽ làm nền + nguồn âm thanh); lưu bản ghi về máy.
- Nút con mắt (góc trên bên trái) ẩn toàn bộ nút điều khiển để xem trọn video/ảnh nền; bấm lần nữa để hiện lại.
- Thỉnh thoảng hươu nghiêng đầu sang một bên rồi trở lại tư thế thẳng.
- Xoay/zoom camera bằng chuột hoặc chạm. Phím tắt: `R` ghi/dừng, `Space` phát/dừng, `H` ẩn/hiện nút.

## Trang V3 (`v3.html`)

Trang riêng, dùng chung toàn bộ tính năng trên, thêm:

- **Sóng nhạc (music spectrum)**: nhiều đường sóng phát sáng màu xanh ngọc → tím → hồng, biên độ theo phổ
  tần số của âm thanh đang phát/ghi. Chọn kiểu trong bảng **Ảnh nền**: *Sóng phát sáng*, *Cột trắng*
  (cột mảnh mọc lên từ đường chấm như visualizer trên video nhạc) hoặc *Tắt*; sóng cũng được ghép vào video khi xuất.
- **Phụ đề tự động**: nút *Phụ đề* nhận dạng lời nói trong âm thanh hiện tại (ghi âm, file, TikTok) bằng mô hình
  [Whisper](https://github.com/openai/whisper) chạy ngay trong trình duyệt qua
  [transformers.js](https://github.com/huggingface/transformers.js) – không gửi âm thanh lên máy chủ. Chọn tiếng Việt,
  English hoặc tự nhận diện; mô hình *Nhanh* (~80 MB) hoặc *Chính xác hơn* (~250 MB), chỉ tải lần đầu rồi được lưu lại.
  Dùng GPU (WebGPU) nếu máy hỗ trợ, nếu không thì CPU. Phụ đề hiện trên màn hình khi phát lại, sửa được từng dòng,
  tải về dạng `.srt`, và được ghép vào video khi xuất.
- **Ẩn/hiện hươu**: bỏ chọn *Hiện hươu* trong bảng **Ảnh nền** để chỉ còn nền, sóng nhạc và phụ đề (cả khi xuất video).
- Nền mặc định **Tối** cho sóng nhạc nổi bật; lựa chọn nền lưu riêng với trang gốc.

## Chạy

```bash
npm install
npm run dev      # http://localhost:5173 (trang V3: /v3.html)
npm run build    # xuất bản tĩnh vào dist/
```

Micro chỉ hoạt động trên `localhost` hoặc HTTPS. Thư mục `dist/` có thể đưa lên bất kỳ hosting tĩnh nào
(GitHub Pages, Netlify, Vercel…).

## Cấu trúc

| File | Nội dung |
| --- | --- |
| `src/giraffe.js` | Dựng mô hình hươu từ các khối hình học và hàm `setPose` điều khiển khớp |
| `src/analysis.js` | Phân tích giọng nói và sinh các track chuyển động, `samplePose` để lấy pose theo thời gian |
| `src/backgrounds.js` | Ảnh nền dựng sẵn (SVG), tải ảnh, lưu lựa chọn |
| `src/tiktok.js` | Lấy link file video từ link TikTok (qua tikwm.com, có proxy dự phòng) |
| `src/subtitles.js`, `src/whisper.worker.js` | Phụ đề tự động (Whisper trong Web Worker), chia dòng, SRT, vẽ phụ đề khi xuất |
| `src/spectrum.js` | Sóng nhạc (sóng phát sáng, cột trắng) |
| `proxy/tiktok-proxy.js` | Cloudflare Worker làm proxy CORS cho TikTok |
| `src/main.js` | Cảnh 3D, ghi âm, phát lại, dòng thời gian, giao diện |

## Deploy lên GitHub Pages

Workflow `.github/workflows/deploy.yml` tự build và deploy mỗi khi push lên nhánh chính.
Lần đầu cần bật Pages: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
Trang sẽ có địa chỉ `https://<user>.github.io/talker/`.

## Video TikTok và proxy

Trang chạy hoàn toàn trên trình duyệt nên không tự đọc được link TikTok. App dùng API công khai
[tikwm.com](https://www.tikwm.com) (dịch vụ bên thứ ba, không chính thức) để lấy link file video, rồi tải file
về để vừa làm nền vừa phân tích âm thanh. Nếu trình duyệt bị chặn tải file (CORS), video vẫn được đặt làm nền
nhưng hươu không nói theo được – khi đó cần một proxy nhỏ:

1. Tạo tài khoản miễn phí tại [Cloudflare](https://dash.cloudflare.com) → **Workers & Pages → Create → Worker**.
2. Dán nội dung `proxy/tiktok-proxy.js` vào, chỉnh `ALLOWED_ORIGINS` nếu cần, bấm **Deploy**.
   Bạn sẽ có địa chỉ dạng `https://talker-proxy.<tên>.workers.dev`.
3. Khai báo proxy cho app, chọn một trong hai cách:
   - Repo GitHub → **Settings → Secrets and variables → Actions → Variables** → thêm biến `TIKTOK_PROXY`
     với địa chỉ Worker, rồi chạy lại workflow deploy.
   - Hoặc mở trang với `?proxy=https://talker-proxy.<tên>.workers.dev` (được nhớ cho các lần sau).

Cách luôn chạy được mà không cần proxy: tải video TikTok về máy rồi dùng nút **Mở file**.
