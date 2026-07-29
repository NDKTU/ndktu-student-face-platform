import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { StudentDraft } from '@/entities/student/model/types';
import type { StudentStatus } from '@/entities/university/model/types';
import type { FacultyTree } from '@/features/talabalar/lib/facultyTree';
import { Modal, ModalField, modalInputClass } from '@/shared/ui/Modal';
import { Button } from '@/shared/ui/Button';
import { useToast } from '@/shared/ui/Toast';

const GENDERS: StudentDraft['jinsi'][] = ['Erkak', 'Ayol'];
const KURSLAR = ['1', '2', '3', '4'];
const SHAKLLAR = ['Kunduzgi', 'Sirtqi'];
const EDU_TYPES = ['Bakalavr', 'Magistr'];
const LANGS = ["O'zbek", 'Rus', 'Ingliz'];
const PAYS = ['Kontrakt', 'Grant'];
const STATUSES: StudentStatus[] = ['Faol', "Akademik ta'til", "Ta'til"];

export const EMPTY_STUDENT_DRAFT: StudentDraft = {
  familiya: '',
  ism: '',
  otasi: '',
  jinsi: 'Erkak',
  birth: '',
  sid: '',
  fakultet: '',
  mutaxassislik: '',
  guruh: '',
  kurs: '1',
  semestr: '1',
  shakl: 'Kunduzgi',
  eduType: 'Bakalavr',
  lang: "O'zbek",
  pay: 'Kontrakt',
  holati: 'Faol',
  jshshir: '',
  manzil: '',
  email: '',
  phone: '',
};

interface StudentModalProps {
  tree: FacultyTree[];
  onSave: (draft: StudentDraft) => void;
  onCancel: () => void;
}

/** Форма «Yangi talaba»: личное, учёба, закрытый блок и контакты. */
export function StudentModal({ tree, onSave, onCancel }: StudentModalProps) {
  const { t } = useTranslation('talabalar');
  const { t: tc } = useTranslation('common');
  const toast = useToast();
  const [draft, setDraft] = useState<StudentDraft>(EMPTY_STUDENT_DRAFT);

  function set<K extends keyof StudentDraft>(key: K, value: StudentDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  // Мутахассислик и группа зависят от выбора выше — иначе можно собрать
  // несуществующую комбинацию.
  const specialities = tree.find((f) => f.name === draft.fakultet)?.specialities ?? [];
  const groups = specialities.find((s) => s.name === draft.mutaxassislik)?.groups ?? [];

  function submit() {
    if (!draft.sid.trim()) {
      toast(t('validation.sidRequired'));
      return;
    }
    onSave(draft);
  }

  const text = (key: keyof StudentDraft, ph?: string) => (
    <input
      value={draft[key] as string}
      onChange={(e) => set(key, e.target.value as never)}
      placeholder={ph}
      className={modalInputClass}
    />
  );

  const pick = (key: keyof StudentDraft, options: string[], placeholder?: string) => (
    <select
      value={draft[key] as string}
      onChange={(e) => set(key, e.target.value as never)}
      className={modalInputClass}
    >
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );

  return (
    <Modal
      title={t('modal.add')}
      size="lg"
      onClose={onCancel}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            {tc('cancel')}
          </Button>
          <Button onClick={submit}>{tc('save')}</Button>
        </>
      }
    >
      <div className="flex items-center gap-2 rounded-11 bg-surface-raised px-3.5 py-2.5 text-12-5 text-ink-muted">
        <InfoIcon />
        {t('modal.note')}
      </div>

      {/* --- Личное --- */}
      <Section title={t('section.shaxsiy')}>
        <div className="flex gap-3.5">
          <div className="grid size-[76px] flex-none place-items-center rounded-12 border border-dashed border-line-strong bg-surface-raised text-11 font-semibold text-ink-subtle">
            <PhotoIcon />
            <span className="mt-1 leading-tight">{t('photo')}</span>
          </div>
          <div className="grid flex-1 grid-cols-1 gap-3.5 sm:grid-cols-3">
            <ModalField label={t('field.familiya')}>{text('familiya')}</ModalField>
            <ModalField label={t('field.ism')}>{text('ism')}</ModalField>
            <ModalField label={t('field.otasi')}>{text('otasi')}</ModalField>
          </div>
        </div>
        <Row cols={2}>
          <ModalField label={t('field.jinsi')}>{pick('jinsi', GENDERS)}</ModalField>
          <ModalField label={t('field.birth')}>{text('birth', t('placeholder.date'))}</ModalField>
        </Row>
      </Section>

      {/* --- Учёба --- */}
      <Section title={t('section.oqish')}>
        <ModalField label={`${t('field.sid')} *`}>{text('sid', t('placeholder.sid'))}</ModalField>

        <Row cols={3}>
          <ModalField label={t('field.fakultet')}>
            <select
              value={draft.fakultet}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  fakultet: e.target.value,
                  mutaxassislik: '',
                  guruh: '',
                }))
              }
              className={modalInputClass}
            >
              <option value="">{t('placeholder.select')}</option>
              {tree.map((f) => (
                <option key={f.name} value={f.name}>
                  {f.name}
                </option>
              ))}
            </select>
          </ModalField>
          <ModalField label={t('field.mutaxassislik')}>
            <select
              value={draft.mutaxassislik}
              onChange={(e) =>
                setDraft((d) => ({ ...d, mutaxassislik: e.target.value, guruh: '' }))
              }
              className={modalInputClass}
            >
              <option value="">{t('placeholder.select')}</option>
              {/* Ключ по индексу: генератор даёт факультету две одноимённые
                  специальности («Dasturiy injiniring»), и по имени они схлопываются. */}
              {specialities.map((s, i) => (
                <option key={`${s.name}-${i}`} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
          </ModalField>
          <ModalField label={t('field.guruh')}>
            {pick('guruh', groups, t('placeholder.select'))}
          </ModalField>
        </Row>

        <Row cols={3}>
          <ModalField label={t('field.kurs')}>{pick('kurs', KURSLAR)}</ModalField>
          <ModalField label={t('field.semestr')}>{text('semestr')}</ModalField>
          <ModalField label={t('field.shakl')}>{pick('shakl', SHAKLLAR)}</ModalField>
        </Row>

        <Row cols={3}>
          <ModalField label={t('field.eduType')}>{pick('eduType', EDU_TYPES)}</ModalField>
          <ModalField label={t('field.lang')}>{pick('lang', LANGS)}</ModalField>
          <ModalField label={t('field.pay')}>{pick('pay', PAYS)}</ModalField>
        </Row>

        <Row cols={3}>
          <ModalField label={t('field.holati')}>{pick('holati', STATUSES)}</ModalField>
        </Row>
      </Section>

      {/* --- Персональные данные (locked) --- */}
      <div className="rounded-14 border border-line bg-surface-raised p-4">
        <div className="mb-3 flex items-center gap-2 text-12 font-bold tracking-[0.04em] text-ink-muted uppercase">
          <LockIcon />
          {t('section.maxfiy')}
        </div>
        <Row cols={2}>
          <ModalField label={t('field.jshshir')}>
            {text('jshshir', t('placeholder.jshshir'))}
          </ModalField>
          <ModalField label={t('field.manzil')}>{text('manzil', t('placeholder.manzil'))}</ModalField>
        </Row>
      </div>

      {/* --- Контакты --- */}
      <Section title={t('section.aloqa')}>
        <Row cols={2}>
          <ModalField label={t('field.email')}>{text('email', t('placeholder.email'))}</ModalField>
          <ModalField label={t('field.phone')}>{text('phone', t('placeholder.phone'))}</ModalField>
        </Row>
      </Section>
    </Modal>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3.5">
      <div className="text-12 font-bold tracking-[0.04em] text-ink-subtle uppercase">{title}</div>
      {children}
    </section>
  );
}

function Row({ cols, children }: { cols: 2 | 3; children: ReactNode }) {
  return (
    <div className={`grid grid-cols-1 gap-3.5 ${cols === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
      {children}
    </div>
  );
}

function PhotoIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="8.5" cy="10" r="1.5" />
      <path d="m21 16-5-5L5 21" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg className="flex-none" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </svg>
  );
}
