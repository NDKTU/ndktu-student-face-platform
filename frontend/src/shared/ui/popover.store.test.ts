import { beforeEach, describe, expect, it } from 'vitest';
import { usePopoverStore } from './popover.store';

const store = () => usePopoverStore.getState();

describe('popover store', () => {
  beforeEach(() => {
    usePopoverStore.setState({ openId: null });
  });

  it('по умолчанию всё закрыто', () => {
    expect(store().openId).toBeNull();
  });

  it('открытие второго поповера закрывает первый', () => {
    store().toggle('notifications');
    expect(store().openId).toBe('notifications');

    store().toggle('avatar');
    expect(store().openId).toBe('avatar');
  });

  it('повторное нажатие на тот же поповер закрывает его', () => {
    store().toggle('avatar');
    store().toggle('avatar');
    expect(store().openId).toBeNull();
  });

  it('close закрывает что бы ни было открыто', () => {
    store().toggle('notifications');
    store().close();
    expect(store().openId).toBeNull();
  });
});
