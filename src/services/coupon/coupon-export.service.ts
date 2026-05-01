import ExcelJS from 'exceljs';
import { CouponExportMode, CouponService } from './coupon.service';

export class CouponExportService {
  static async exportCouponsToExcel(mode: CouponExportMode = 'all'): Promise<Buffer> {
    const coupons = await CouponService.getCouponsForExport(mode);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Probox Bot';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Coupons');
    sheet.columns = [
      { header: 'Coupon Code', key: 'code', width: 16 },
      { header: 'User Exists', key: 'user_exists', width: 14 },
      { header: 'User Name', key: 'user_name', width: 24 },
      { header: 'Phone', key: 'phone_number', width: 18 },
      { header: 'Source Type', key: 'source_type', width: 16 },
      { header: 'Promotion', key: 'promotion', width: 24 },
      { header: 'Created At', key: 'created_at', width: 22 },
      { header: 'Expires At', key: 'expires_at', width: 22 },
      { header: 'Status', key: 'status', width: 12 },
    ];

    sheet.getRow(1).font = { bold: true };
    sheet.autoFilter = { from: 'A1', to: 'I1' };

    coupons.forEach((coupon) => {
      sheet.addRow({
        code: coupon.code,
        user_exists: coupon.user_exists ? 'Yes' : 'No',
        user_name: [coupon.first_name, coupon.last_name].filter(Boolean).join(' ') || '-',
        phone_number: coupon.phone_number || '-',
        source_type: coupon.source_type,
        promotion: coupon.promotion_title_uz || coupon.promotion_title_ru || '-',
        created_at: new Date(coupon.created_at).toLocaleString('uz-UZ'),
        expires_at: new Date(coupon.expires_at).toLocaleString('uz-UZ'),
        status: coupon.status,
      });
    });

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }
}
