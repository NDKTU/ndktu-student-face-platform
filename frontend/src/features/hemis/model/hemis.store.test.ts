import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HemisPreview } from '@/shared/api/hemis';
import { useHemisStore } from './hemis.store';

vi.mock('@/shared/api/hemis', () => ({
  previewHemis: vi.fn(),
  syncHemis: vi.fn(),
  hemisLogin: vi.fn(),
  getGroupOptions: vi.fn(),
}));

const api = vi.mocked(await import('@/shared/api/hemis'));

const store = () => useHemisStore.getState();

function preview(over: Partial<HemisPreview> = {}): HemisPreview {
  return {
    profile: {
      fullName: 'Aliyev Ali Alievich',
      studentIdNumber: '123456',
      image: '',
      university: 'NDKTU',
      faculty: 'Konchilik fakulteti',
      group: 'KI-24-01',
      specialty: 'Konchilik ishi',
      level: '1',
      semester: '1',
      educationForm: 'kunduzgi',
      educationType: 'bakalavr',
      paymentForm: 'kontrakt',
      educationLang: 'uz',
      studentStatus: 'Faol',
      gender: 'Erkak',
      phone: '',
      address: '',
      birthDate: '',
    },
    userId: null,
    facultyId: null,
    groupId: null,
    userExists: false,
    facultyExists: false,
    groupExists: false,
    suggestedGroup: 'KI-24-01',
    existingResults: [],
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  store().reset();
});

describe('hemis.store', () => {
  it('превью подставляет найденные факультет и группу', async () => {
    api.previewHemis.mockResolvedValue(preview({ facultyId: 3, groupId: 8, facultyExists: true, groupExists: true }));
    store().setCredentials('talaba1', 'parol');

    await store().loadPreview();

    expect(api.previewHemis).toHaveBeenCalledWith({ login: 'talaba1', password: 'parol' });
    expect(store()).toMatchObject({ step: 'preview', facultyId: 3, groupId: 8, busy: false });
  });

  it('сбой превью не уводит с формы входа', async () => {
    api.previewHemis.mockRejectedValue(new Error('HEMIS javob bermadi'));
    store().setCredentials('talaba1', 'parol');

    await store().loadPreview();

    expect(store()).toMatchObject({ step: 'credentials', busy: false, error: 'HEMIS javob bermadi' });
  });

  it('смена факультета сбрасывает группу — она могла быть из другого', () => {
    useHemisStore.setState({ facultyId: 1, groupId: 5 });

    store().setFacultyId(2);

    expect(store()).toMatchObject({ facultyId: 2, groupId: null });
  });

  it('импорт отправляет ручное переопределение', async () => {
    api.syncHemis.mockResolvedValue({ success: true, message: 'ok', userId: 12 });
    store().setCredentials('talaba1', 'parol');
    useHemisStore.setState({ facultyId: 2, groupId: 7 });

    await store().sync();

    expect(api.syncHemis).toHaveBeenCalledWith(
      { login: 'talaba1', password: 'parol' },
      { facultyId: 2, groupId: 7 },
    );
    expect(store().step).toBe('done');
  });

  it('после импорта пароль в сторе не остаётся', async () => {
    api.syncHemis.mockResolvedValue({ success: true, message: 'ok', userId: 12 });
    store().setCredentials('talaba1', 'parol');

    await store().sync();

    expect(store().password).toBe('');
  });

  it('сбой импорта оставляет на экране сверки — можно повторить', async () => {
    api.syncHemis.mockRejectedValue(new Error('409'));
    useHemisStore.setState({ step: 'preview', login: 'talaba1', password: 'parol' });

    await store().sync();

    expect(store()).toMatchObject({ step: 'preview', busy: false, error: '409' });
  });

  it('reset стирает пароль и превью', () => {
    useHemisStore.setState({ step: 'preview', login: 'talaba1', password: 'parol', preview: preview() });

    store().reset();

    expect(store()).toMatchObject({ step: 'credentials', login: '', password: '', preview: null });
  });
});
