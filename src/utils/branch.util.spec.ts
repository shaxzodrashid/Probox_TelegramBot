import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findBranchByNameCaseInsensitive,
  findNearestBranch,
  formatWorkTimeRange,
  parseWorkTimeRange,
} from './branch.util';

test('parseWorkTimeRange accepts strict HH:MM-HH:MM format', () => {
  const result = parseWorkTimeRange('09:00-18:30');

  assert.deepEqual(result, {
    startTime: '09:00',
    endTime: '18:30',
  });
});

test('parseWorkTimeRange rejects invalid values', () => {
  assert.equal(parseWorkTimeRange('9:00-18:30'), null);
  assert.equal(parseWorkTimeRange('24:00-18:30'), null);
  assert.equal(parseWorkTimeRange('18:30 - 19:30'), null);
});

test('formatWorkTimeRange formats correctly when both start and end times are provided', () => {
  const result = formatWorkTimeRange({ work_start_time: '09:00', work_end_time: '18:00' });
  assert.equal(result, '09:00-18:00');
});

test('formatWorkTimeRange handles missing work_start_time correctly, defaulting to --:--', () => {
  const result = formatWorkTimeRange({ work_start_time: null, work_end_time: '18:00' });
  assert.equal(result, '--:---18:00');
});

test('formatWorkTimeRange handles missing work_end_time correctly, defaulting to --:--', () => {
  const result = formatWorkTimeRange({ work_start_time: '09:00', work_end_time: null });
  assert.equal(result, '09:00---:--');
});

test('formatWorkTimeRange handles missing both work_start_time and work_end_time, defaulting to --:-----:--', () => {
  const result = formatWorkTimeRange({ work_start_time: null, work_end_time: null });
  assert.equal(result, '--:-----:--');
});

test('findBranchByNameCaseInsensitive matches duplicate names regardless of case', () => {
  const branches = [
    { name: 'Yunusobod' },
    { name: 'Chilonzor' },
  ];

  const match = findBranchByNameCaseInsensitive(branches, '  yunusobod ');

  assert.equal(match?.name, 'Yunusobod');
});

test('findNearestBranch ignores inactive branches and branches without coordinates', () => {
  const branches = [
    {
      name: 'Inactive branch',
      is_active: false,
      latitude: '41.3100',
      longitude: '69.2400',
    },
    {
      name: 'No coordinates',
      is_active: true,
      latitude: null,
      longitude: null,
    },
    {
      name: 'Closest active branch',
      is_active: true,
      latitude: '41.3110',
      longitude: '69.2790',
    },
    {
      name: 'Farther active branch',
      is_active: true,
      latitude: '41.3500',
      longitude: '69.3800',
    },
  ];

  const nearest = findNearestBranch(branches, 41.312, 69.278);

  assert.equal(nearest?.name, 'Closest active branch');
});
