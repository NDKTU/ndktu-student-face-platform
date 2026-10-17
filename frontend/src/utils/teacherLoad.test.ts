import { describe, expect, it } from 'vitest';
import type { TeacherLoadItem } from '@/services/zoomSessionService';
import { loadGroups, loadSubjects, loadTypes } from './teacherLoad';

const item = (subject_id: number, subject_name: string, group_id: number, group_name: string, load_types: string[]): TeacherLoadItem => ({
    subject_id,
    subject_name,
    group_id,
    group_name,
    load_types,
});

// Fizika — oqim (101, 102) ma'ruza va 101 da amaliyot; Kimyo — faqat 102 da tajriba.
const items = [
    item(1, 'Fizika', 101, '101-25', ['lecture', 'practice']),
    item(1, 'Fizika', 102, '102-25', ['lecture']),
    item(2, 'Kimyo', 102, '102-25', ['lab']),
];

describe('loadGroups', () => {
    it('guruhlar o\'z fanlari bilan', () => {
        expect(loadGroups(items)).toEqual([
            { id: 101, name: '101-25', subjects: ['Fizika'] },
            { id: 102, name: '102-25', subjects: ['Fizika', 'Kimyo'] },
        ]);
    });
});

describe('loadSubjects', () => {
    it('guruh tanlanmagan — hamma fanlar', () => {
        expect(loadSubjects(items, []).map((s) => s.name)).toEqual(['Fizika', 'Kimyo']);
    });
    it('bitta guruh — uning fanlari', () => {
        expect(loadSubjects(items, [102]).map((s) => s.name)).toEqual(['Fizika', 'Kimyo']);
        expect(loadSubjects(items, [101]).map((s) => s.name)).toEqual(['Fizika']);
    });
    it('oqim — hamma guruhda umumiy fan', () => {
        expect(loadSubjects(items, [101, 102]).map((s) => s.name)).toEqual(['Fizika']);
    });
    it("yuklamada yo'q qo'shimcha guruh hisobga olinmaydi", () => {
        expect(loadSubjects(items, [101, 999]).map((s) => s.name)).toEqual(['Fizika']);
    });
});

describe('loadTypes', () => {
    it('tanlangan guruhlardagi turlar', () => {
        expect(loadTypes(items, 1, [102])).toEqual(['lecture']);
        expect(loadTypes(items, 1, [101]).sort()).toEqual(['lecture', 'practice']);
    });
    it('guruh tanlanmagan — fanning hamma turlari', () => {
        expect(loadTypes(items, 1, []).sort()).toEqual(['lecture', 'practice']);
    });
    it('fan tanlanmagan — bo\'sh', () => {
        expect(loadTypes(items, null, [101])).toEqual([]);
    });
});
