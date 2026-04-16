import { IBusinessPartner } from '../interfaces/business-partner.interface'

export const isSapBusinessPartnerAdmin = (
  partner?: Pick<IBusinessPartner, 'U_admin'> | null,
): boolean => partner?.U_admin?.trim().toLowerCase() === 'yes'

export const selectPreferredSapBusinessPartner = (
  partners: IBusinessPartner[],
): IBusinessPartner | undefined => {
  if (partners.length === 0) {
    return undefined
  }

  return partners.find((partner) => isSapBusinessPartnerAdmin(partner)) ?? partners[0]
}
