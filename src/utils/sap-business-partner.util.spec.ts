import assert from 'node:assert/strict'
import test from 'node:test'

import { IBusinessPartner } from '../interfaces/business-partner.interface'
import {
  isSapBusinessPartnerAdmin,
  selectPreferredSapBusinessPartner,
} from './sap-business-partner.util'

test('isSapBusinessPartnerAdmin accepts SAP yes values case-insensitively', () => {
  assert.equal(isSapBusinessPartnerAdmin({ U_admin: 'yes' } as IBusinessPartner), true)
  assert.equal(isSapBusinessPartnerAdmin({ U_admin: ' YES ' } as IBusinessPartner), true)
  assert.equal(isSapBusinessPartnerAdmin({ U_admin: 'no' } as IBusinessPartner), false)
  assert.equal(isSapBusinessPartnerAdmin(undefined), false)
})

test('selectPreferredSapBusinessPartner prefers the admin-enabled partner for duplicate phones', () => {
  const partners: IBusinessPartner[] = [
    {
      CardCode: 'BP260317133803N',
      CardName: 'Regular Profile',
      CardType: 'C',
      Phone1: '998903367448',
      U_admin: 'no',
    },
    {
      CardCode: 'PUZS100',
      CardName: 'Admin Profile',
      CardType: 'C',
      Phone1: '998903367448',
      U_admin: 'yes',
    },
  ]

  const selected = selectPreferredSapBusinessPartner(partners)

  assert.equal(selected?.CardCode, 'PUZS100')
})

test('selectPreferredSapBusinessPartner falls back to the first partner when none are admin', () => {
  const partners: IBusinessPartner[] = [
    {
      CardCode: 'C001',
      CardName: 'First',
      CardType: 'C',
      U_admin: 'no',
    },
    {
      CardCode: 'C002',
      CardName: 'Second',
      CardType: 'C',
      U_admin: 'no',
    },
  ]

  const selected = selectPreferredSapBusinessPartner(partners)

  assert.equal(selected?.CardCode, 'C001')
})
