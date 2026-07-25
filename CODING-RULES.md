# QUY TẮC LÀM VIỆC TRÊN CODEBASE NÀY

> Áp dụng cho cả người và trợ lý AI. Mục đích: giảm các lỗi kinh điển khi sửa code —
> phình phạm vi, code thừa, đoán mò thay vì hỏi.
>
> **Đánh đổi:** bộ quy tắc này ưu tiên **cẩn trọng hơn tốc độ**. Việc thật sự nhỏ thì dùng phán đoán.

---

## 1. Nghĩ trước khi code

**Không đoán. Không giấu chỗ đang bối rối. Nói rõ đánh đổi.**

Trước khi bắt tay:
- Nêu giả định ra thành lời. Không chắc thì hỏi.
- Có nhiều cách hiểu yêu cầu → trình bày cả, đừng tự chọn một cách trong im lặng.
- Có cách đơn giản hơn → nói ra. Phản biện khi thấy cần.
- Có chỗ không rõ → **dừng lại**, gọi tên đúng chỗ đang mơ hồ, rồi hỏi.

Với module lạ: tra phần tương ứng trong `docs/PLAN-HISTORY.md` **trước khi** hỏi hoặc sửa — phần lớn câu
hỏi "sao không làm cách đơn giản hơn?" đã có câu trả lời sẵn ở đó.

## 2. Đơn giản trước

**Lượng code tối thiểu giải quyết đúng vấn đề. Không có gì mang tính phòng xa.**

- Không thêm tính năng ngoài yêu cầu.
- Không trừu tượng hoá cho đoạn code chỉ dùng một lần.
- Không "linh hoạt" / "cấu hình được" khi không ai yêu cầu.
- Không bắt lỗi cho tình huống bất khả thi.
- Viết 200 dòng mà 50 dòng làm được → viết lại.

Tự hỏi: "Một senior engineer nhìn vào có nói cái này rối quá không?" Nếu có → làm gọn lại.

## 3. Sửa đúng chỗ cần sửa

**Chỉ động vào thứ buộc phải động. Chỉ dọn rác do chính mình tạo ra.**

Khi sửa code có sẵn:
- Không "cải thiện" code, comment, format ở xung quanh.
- Không refactor thứ đang chạy tốt.
- Bám theo style hiện có, kể cả khi mình thích kiểu khác.
- Thấy dead code không liên quan → **báo, không xoá**.

Khi thay đổi của mình tạo ra thứ mồ côi:
- Xoá import / biến / hàm mà **thay đổi của mình** làm cho không còn ai dùng.
- Không xoá dead code có từ trước, trừ khi được yêu cầu.

Phép thử: **mọi dòng thay đổi phải truy ngược được về yêu cầu của người dùng.**

## 4. Chạy theo mục tiêu kiểm chứng được

**Định nghĩa tiêu chí thành-bại. Lặp đến khi verify xong.**

Biến yêu cầu mơ hồ thành mục tiêu kiểm chứng được:
- "Thêm validation" → "Xác định các input không hợp lệ, chạy thử từng cái, đối chiếu kết quả mong đợi"
- "Sửa bug" → "Tái hiện được bug trước, sửa, rồi tái hiện lại đúng kịch bản đó"
- "Refactor X" → "Chốt hành vi trước khi sửa, đối chiếu lại sau khi sửa"

Việc nhiều bước → nêu kế hoạch ngắn:

```
1. [Bước] → verify: [cách kiểm]
2. [Bước] → verify: [cách kiểm]
3. [Bước] → verify: [cách kiểm]
```

Tiêu chí mạnh cho phép tự chạy độc lập. Tiêu chí yếu ("làm cho nó chạy được") thì lúc nào cũng phải hỏi lại.

### Verify trong dự án này nghĩa là gì

Repo **chưa có test tự động** (cố ý — xem `HANDOVER.md` mục 10.6). Vì vậy vòng lặp verify của mục 4
ánh xạ sang quy trình bắt buộc ở `HANDOVER.md` mục 7:

```bash
npx tsc --noEmit          # phải sạch
npx eslint src --quiet    # phải sạch
# i18n parity (lệnh ở HANDOVER mục 4.2) — phải 0/0
npx next build            # phải sạch, không mất route nào
```

Sau đó verify trên browser thật với đúng nghiệp vụ vừa sửa. Thay đổi liên quan **tiền / công thức**
phải đối chiếu bằng **số cụ thể** so với kỳ vọng — "trang không báo lỗi" không phải là verify.

Đừng tự dựng hạ tầng test khi không được yêu cầu: đó đúng là loại việc "thêm thứ không ai yêu cầu"
mà mục 2 cấm. Muốn có test thì đề xuất trước, để chủ dự án quyết.

---

**Bộ quy tắc này đang phát huy tác dụng nếu:** diff ít thay đổi thừa hơn, ít phải viết lại vì làm phức tạp
quá mức, và câu hỏi làm rõ xuất hiện **trước khi** code chứ không phải sau khi đã sai.

> Ràng buộc **nghiệp vụ** (bất biến CO/CE, i18n, ngày UTC, migration, deploy) nằm ở `HANDOVER.md`.
> File này chỉ nói về **cách làm việc**. Hai bộ bổ sung cho nhau, không thay thế nhau.
