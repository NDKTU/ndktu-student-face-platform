import { describe, expect, it } from 'vitest';
import { buildSidebar, type SidebarSection } from './resources';

const hrefs = (sections: SidebarSection[]): string[] =>
    sections.flatMap((section) => section.items.flatMap((item) => [item.href, ...(item.children ?? []).map((c) => c.href)]));

const perms = (...resources: string[]) => new Set(resources.map((r) => `read:${r}`));

describe('buildSidebar', () => {
    it('ruxsatsiz punkt chiqmaydi', () => {
        const menu = hrefs(buildSidebar(perms('student'), ['admin']));
        expect(menu).toContain('/students');
        expect(menu).not.toContain('/users');
    });

    it('o\'quv yuklamasi — faqat admin, ruxsat boshqa rolga berilgan bo\'lsa ham', () => {
        expect(hrefs(buildSidebar(perms('teacher_assignment'), ['admin']))).toContain('/teacher-assignments');
        expect(hrefs(buildSidebar(perms('teacher_assignment'), ['tutor']))).not.toContain('/teacher-assignments');
    });

    it('sof o\'qituvchi ko\'rinishida ma\'lumotnoma yashirin, psixolog aralashsa — yo\'q', () => {
        expect(hrefs(buildSidebar(perms('teacher'), ['teacher']))).not.toContain('/teachers');
        expect(hrefs(buildSidebar(perms('teacher'), ['teacher', 'psixologik']))).toContain('/teachers');
    });
});
