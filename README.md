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
- Mở file âm thanh có sẵn thay vì ghi âm; lưu bản ghi về máy.
- Xoay/zoom camera bằng chuột hoặc chạm. Phím tắt: `R` ghi/dừng, `Space` phát/dừng.

## Chạy

```bash
npm install
npm run dev      # http://localhost:5173
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
| `src/main.js` | Cảnh 3D, ghi âm, phát lại, dòng thời gian, giao diện |

## Deploy lên GitHub Pages

Workflow `.github/workflows/deploy.yml` tự build và deploy mỗi khi push lên nhánh chính.
Lần đầu cần bật Pages: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
Trang sẽ có địa chỉ `https://<user>.github.io/talker/`.
