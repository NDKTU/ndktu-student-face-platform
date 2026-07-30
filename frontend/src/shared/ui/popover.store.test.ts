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

  it('повторное нажатие на тот же поповер закрывает его', () => {
    store().toggle('avatar');
    store().toggle('avatar');
    expect(store().openId).toBeNull();
  });

  it('close закрывает что бы ни было открыто', () => {
    store().toggle('avatar');
    store().close();
    expect(store().openId).toBeNull();
  });
});
