-- LOF-V1b: CE hợp đồng khung của nhóm chiến dịch — số tham chiếu nhập tay từ hợp đồng,
-- trang nhóm so với Σ ceTotal các phase để lộ phát sinh. Không vào báo cáo tiền nào.
ALTER TABLE "project_group" ADD COLUMN "frameworkCe" BIGINT;
