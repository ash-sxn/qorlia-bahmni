import { ObservationForm } from '@bahmni/services';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  renderHook as renderBaseHook,
  waitFor,
  act,
} from '@testing-library/react';
import React from 'react';
import * as pinnedFormsService from '../../services/pinnedFormsService';
import { usePinnedObservationForms } from '../usePinnedObservationForms';

// Mock the dependencies
jest.mock('../../services/pinnedFormsService');

const mockLoadPinnedForms =
  pinnedFormsService.loadPinnedForms as jest.MockedFunction<
    typeof pinnedFormsService.loadPinnedForms
  >;
const mockSavePinnedForms =
  pinnedFormsService.savePinnedForms as jest.MockedFunction<
    typeof pinnedFormsService.savePinnedForms
  >;

let queryClient: QueryClient;
const renderHook: typeof renderBaseHook = (callback, options) =>
  renderBaseHook(callback, {
    ...options,
    wrapper: ({ children }) =>
      React.createElement(
        QueryClientProvider,
        { client: queryClient },
        children,
      ),
  });

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

describe('usePinnedObservationForms', () => {
  const mockForms: ObservationForm[] = [
    {
      uuid: 'form-1',
      name: 'History and Examination',
      id: 1,
      privileges: [],
    },
    {
      uuid: 'form-2',
      name: 'Vitals',
      id: 2,
      privileges: [],
    },
    {
      uuid: 'form-3',
      name: 'Progress Notes',
      id: 3,
      privileges: [],
    },
  ];

  const mockUserUuid = 'user-123';

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    jest.clearAllMocks();
    mockLoadPinnedForms.mockResolvedValue([]);
    mockSavePinnedForms.mockResolvedValue(undefined);
  });

  afterEach(() => queryClient.clear());

  describe('Initial Loading', () => {
    it('should load pinned forms when forms and userUuid are available', async () => {
      mockLoadPinnedForms.mockResolvedValue([
        'History and Examination',
        'Vitals',
      ]);

      const { result } = renderHook(() =>
        usePinnedObservationForms(mockForms, { userUuid: mockUserUuid }),
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.pinnedForms).toHaveLength(2);
      expect(result.current.pinnedForms[0].name).toBe(
        'History and Examination',
      );
      expect(result.current.pinnedForms[1].name).toBe('Vitals');
    });

    it('should match pinned forms by name from available forms', async () => {
      mockLoadPinnedForms.mockResolvedValue(['Vitals']);

      const { result } = renderHook(() =>
        usePinnedObservationForms(mockForms, { userUuid: mockUserUuid }),
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.pinnedForms).toHaveLength(1);
      expect(result.current.pinnedForms[0].uuid).toBe('form-2');
    });

    it('should handle empty pinned forms list', async () => {
      mockLoadPinnedForms.mockResolvedValue([]);

      const { result } = renderHook(() =>
        usePinnedObservationForms(mockForms, { userUuid: mockUserUuid }),
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.pinnedForms).toEqual([]);
    });

    it('should ignore pinned form names that do not match available forms', async () => {
      mockLoadPinnedForms.mockResolvedValue(['Vitals', 'Non-existent Form']);

      const { result } = renderHook(() =>
        usePinnedObservationForms(mockForms, { userUuid: mockUserUuid }),
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.pinnedForms).toHaveLength(1);
      expect(result.current.pinnedForms[0].name).toBe('Vitals');
    });
  });

  describe('Error Handling', () => {
    it('should handle errors when loading pinned forms', async () => {
      const error = new Error('Failed to load');
      mockLoadPinnedForms.mockRejectedValue(error);

      const { result } = renderHook(() =>
        usePinnedObservationForms(mockForms, { userUuid: mockUserUuid }),
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBeDefined();
      expect(result.current.error?.message).toBe('Failed to load');
      expect(result.current.pinnedForms).toEqual([]);
    });

    it('should set pinnedForms to empty array on error', async () => {
      mockLoadPinnedForms.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() =>
        usePinnedObservationForms(mockForms, { userUuid: mockUserUuid }),
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.pinnedForms).toEqual([]);
    });

    it('should handle errors when saving pinned forms', async () => {
      mockLoadPinnedForms.mockResolvedValue([]);
      const saveError = new Error('Save failed');
      mockSavePinnedForms.mockRejectedValue(saveError);

      const { result } = renderHook(() =>
        usePinnedObservationForms(mockForms, { userUuid: mockUserUuid }),
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Try to update pinned forms
      await act(async () => {
        await result.current.updatePinnedForms([mockForms[0]]);
      });

      await waitFor(() => {
        expect(result.current.error).toBeDefined();
        expect(result.current.error?.message).toBe('Save failed');
      });

      // Failed persistence must not look like a saved preference.
      expect(result.current.pinnedForms).toEqual([]);
    });
  });

  describe('updatePinnedForms', () => {
    it('should update pinned forms optimistically', async () => {
      mockLoadPinnedForms.mockResolvedValue([]);

      const { result } = renderHook(() =>
        usePinnedObservationForms(mockForms, { userUuid: mockUserUuid }),
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Update pinned forms
      await act(async () => {
        await result.current.updatePinnedForms([mockForms[0], mockForms[1]]);
      });

      // Should update immediately (optimistic)
      await waitFor(() => {
        expect(result.current.pinnedForms).toHaveLength(2);
      });
      expect(result.current.pinnedForms).toContainEqual(mockForms[0]);
      expect(result.current.pinnedForms).toContainEqual(mockForms[1]);
    });

    it('should save pinned form names to backend', async () => {
      mockLoadPinnedForms.mockResolvedValue([]);

      const { result } = renderHook(() =>
        usePinnedObservationForms(mockForms, { userUuid: mockUserUuid }),
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.updatePinnedForms([mockForms[0], mockForms[2]]);
      });

      await waitFor(() => {
        expect(mockSavePinnedForms).toHaveBeenCalledWith(mockUserUuid, [
          'History and Examination',
          'Progress Notes',
        ]);
      });
    });

    it('should handle clearing all pinned forms', async () => {
      mockLoadPinnedForms.mockResolvedValue(['Vitals']);

      const { result } = renderHook(() =>
        usePinnedObservationForms(mockForms, { userUuid: mockUserUuid }),
      );

      await waitFor(() => {
        expect(result.current.pinnedForms).toHaveLength(1);
      });

      await act(async () => {
        await result.current.updatePinnedForms([]);
      });

      await waitFor(() => {
        expect(result.current.pinnedForms).toEqual([]);
      });
      await waitFor(() => {
        expect(mockSavePinnedForms).toHaveBeenCalledWith(mockUserUuid, []);
      });
    });

    it('keeps the previously confirmed pins if save fails', async () => {
      mockLoadPinnedForms.mockResolvedValue(['Vitals']);
      mockSavePinnedForms.mockRejectedValue(new Error('Save failed'));

      const { result } = renderHook(() =>
        usePinnedObservationForms(mockForms, { userUuid: mockUserUuid }),
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.updatePinnedForms([mockForms[0]]);
      });

      expect(result.current.pinnedForms).toEqual([mockForms[1]]);
      await waitFor(() =>
        expect(result.current.error?.message).toBe('Save failed'),
      );
    });
  });

  describe('Refetch', () => {
    it('should re-fetch pinned forms from backend when refetch is called', async () => {
      mockLoadPinnedForms.mockResolvedValue(['Vitals']);

      const { result } = renderHook(() =>
        usePinnedObservationForms(mockForms, { userUuid: mockUserUuid }),
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockLoadPinnedForms).toHaveBeenCalledTimes(1);

      // Update backend data
      mockLoadPinnedForms.mockResolvedValue(['Vitals', 'Progress Notes']);

      // Call refetch
      act(() => {
        result.current.refetch();
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockLoadPinnedForms).toHaveBeenCalledTimes(2);
      expect(result.current.pinnedForms).toHaveLength(2);
      expect(result.current.pinnedForms[0].name).toBe('Vitals');
      expect(result.current.pinnedForms[1].name).toBe('Progress Notes');
    });
  });

  describe('Loading Only Once', () => {
    it('should only load pinned forms once when forms finish loading', async () => {
      mockLoadPinnedForms.mockResolvedValue(['Vitals']);

      const { result, rerender } = renderHook(() =>
        usePinnedObservationForms(mockForms, { userUuid: mockUserUuid }),
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockLoadPinnedForms).toHaveBeenCalledTimes(1);

      // Rerender should not trigger another load
      rerender();
      rerender();

      expect(mockLoadPinnedForms).toHaveBeenCalledTimes(1);
    });

    it('should not reload when forms list changes after initial load', async () => {
      mockLoadPinnedForms.mockResolvedValue(['Vitals']);

      const { result, rerender } = renderHook(
        ({ forms }) =>
          usePinnedObservationForms(forms, { userUuid: mockUserUuid }),
        { initialProps: { forms: mockForms } },
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Change the available forms
      const newForms = [
        ...mockForms,
        { uuid: 'form-4', name: 'New Form', id: 4, privileges: [] },
      ];

      rerender({ forms: newForms });

      // Should still only have loaded once
      expect(mockLoadPinnedForms).toHaveBeenCalledTimes(1);
    });
  });

  describe('Preference lifecycle', () => {
    it('blocks failed-read writes and recovers through a read-only retry', async () => {
      mockLoadPinnedForms.mockRejectedValueOnce(
        new Error('Preferences unavailable'),
      );
      const { result } = renderHook(() =>
        usePinnedObservationForms(mockForms, { userUuid: mockUserUuid }),
      );
      await waitFor(() =>
        expect(result.current.error?.message).toBe('Preferences unavailable'),
      );
      await act(async () => {
        await result.current.updatePinnedForms([mockForms[0]]);
      });
      expect(mockSavePinnedForms).not.toHaveBeenCalled();
      mockLoadPinnedForms.mockResolvedValue(['Vitals']);
      await act(async () => {
        await result.current.refetch();
      });
      await waitFor(() => expect(result.current.error).toBeNull());
      expect(result.current.pinnedForms).toEqual([mockForms[1]]);
      expect(mockSavePinnedForms).not.toHaveBeenCalled();
    });

    it('reconciles a lost save response without replaying the write', async () => {
      mockLoadPinnedForms
        .mockResolvedValueOnce([])
        .mockResolvedValue(['Vitals']);
      mockSavePinnedForms.mockRejectedValueOnce(new Error('Response lost'));
      const { result } = renderHook(() =>
        usePinnedObservationForms(mockForms, { userUuid: mockUserUuid }),
      );
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      await act(async () => {
        await result.current.updatePinnedForms([mockForms[1]]);
      });
      await waitFor(() =>
        expect(result.current.pinnedForms).toEqual([mockForms[1]]),
      );
      expect(result.current.error?.message).toBe('Response lost');
      await act(async () => {
        await result.current.refetch();
      });
      await waitFor(() => expect(result.current.error).toBeNull());
      expect(mockSavePinnedForms).toHaveBeenCalledTimes(1);
    });
    it('does not publish a pin before the native save succeeds', async () => {
      const save = deferred<void>();
      mockSavePinnedForms.mockReturnValue(save.promise);
      const { result } = renderHook(() =>
        usePinnedObservationForms(mockForms, { userUuid: mockUserUuid }),
      );
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      let pending!: Promise<void>;
      act(() => {
        pending = result.current.updatePinnedForms([mockForms[0]]);
      });
      await waitFor(() => expect(mockSavePinnedForms).toHaveBeenCalledTimes(1));
      expect(result.current.pinnedForms).toEqual([]);
      expect(result.current.isLoading).toBe(true);
      await act(async () => {
        save.resolve();
        await pending;
      });
      await waitFor(() =>
        expect(result.current.pinnedForms).toEqual([mockForms[0]]),
      );
    });

    it('cannot overwrite unknown preferences while the initial read is pending', async () => {
      const load = deferred<string[]>();
      mockLoadPinnedForms.mockReturnValue(load.promise);
      const { result } = renderHook(() =>
        usePinnedObservationForms(mockForms, { userUuid: mockUserUuid }),
      );
      await act(async () => {
        await result.current.updatePinnedForms([mockForms[0]]);
      });
      expect(mockSavePinnedForms).not.toHaveBeenCalled();
      await act(async () => {
        load.resolve(['Vitals']);
      });
      await waitFor(() =>
        expect(result.current.pinnedForms).toEqual([mockForms[1]]),
      );
    });

    it('shares confirmed preferences and allows only one in-flight save per user', async () => {
      const save = deferred<void>();
      mockSavePinnedForms.mockReturnValue(save.promise);
      const first = renderHook(() =>
        usePinnedObservationForms(mockForms, { userUuid: mockUserUuid }),
      );
      const second = renderHook(() =>
        usePinnedObservationForms(mockForms, { userUuid: mockUserUuid }),
      );
      await waitFor(() =>
        expect(
          first.result.current.isLoading || second.result.current.isLoading,
        ).toBe(false),
      );
      expect(mockLoadPinnedForms).toHaveBeenCalledTimes(1);
      let pending!: Promise<void>;
      act(() => {
        pending = first.result.current.updatePinnedForms([mockForms[0]]);
      });
      await act(async () => {
        await second.result.current.updatePinnedForms([mockForms[1]]);
      });
      expect(mockSavePinnedForms).toHaveBeenCalledTimes(1);
      await act(async () => {
        save.resolve();
        await pending;
      });
      await waitFor(() =>
        expect(second.result.current.pinnedForms).toEqual([mockForms[0]]),
      );
    });

    it('does not publish a late preference read for a replaced user', async () => {
      const oldLoad = deferred<string[]>();
      mockLoadPinnedForms.mockImplementation((user) =>
        user === mockUserUuid
          ? oldLoad.promise
          : Promise.resolve(['Progress Notes']),
      );
      const { result, rerender } = renderHook(
        ({ user }) => usePinnedObservationForms(mockForms, { userUuid: user }),
        { initialProps: { user: mockUserUuid } },
      );
      rerender({ user: 'new-user' });
      await waitFor(() =>
        expect(result.current.pinnedForms).toEqual([mockForms[2]]),
      );
      await act(async () => {
        oldLoad.resolve(['Vitals']);
      });
      expect(result.current.pinnedForms).toEqual([mockForms[2]]);
    });

    it('does not publish an old save error in a new user context', async () => {
      const save = deferred<void>();
      mockSavePinnedForms.mockReturnValue(save.promise);
      const { result, rerender } = renderHook(
        ({ user }) => usePinnedObservationForms(mockForms, { userUuid: user }),
        { initialProps: { user: mockUserUuid } },
      );
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      let pending!: Promise<void>;
      act(() => {
        pending = result.current.updatePinnedForms([mockForms[0]]);
      });
      await waitFor(() => expect(mockSavePinnedForms).toHaveBeenCalledTimes(1));
      rerender({ user: 'new-user' });
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      await act(async () => {
        save.reject(new Error('Old save failed'));
        await pending;
      });
      expect(result.current.error).toBeNull();
      expect(result.current.pinnedForms).toEqual([]);
    });

    it('retains stored pins outside the currently permitted form catalogue', async () => {
      mockLoadPinnedForms.mockResolvedValue([
        'Hidden programme form',
        'Vitals',
      ]);
      const { result } = renderHook(() =>
        usePinnedObservationForms(mockForms, { userUuid: mockUserUuid }),
      );
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      await act(async () => {
        await result.current.updatePinnedForms([mockForms[0]]);
      });
      expect(mockSavePinnedForms).toHaveBeenCalledWith(mockUserUuid, [
        'Hidden programme form',
        'History and Examination',
      ]);
      await waitFor(() =>
        expect(result.current.pinnedForms).toEqual([mockForms[0]]),
      );
    });

    it('rematches confirmed names when available forms change without another user read', async () => {
      mockLoadPinnedForms.mockResolvedValue(['Vitals']);
      const { result, rerender } = renderHook(
        ({ forms }) =>
          usePinnedObservationForms(forms, { userUuid: mockUserUuid }),
        { initialProps: { forms: mockForms } },
      );
      await waitFor(() =>
        expect(result.current.pinnedForms).toEqual([mockForms[1]]),
      );
      const updated = { ...mockForms[1], uuid: 'new-vitals-version' };
      rerender({ forms: [updated] });
      expect(result.current.pinnedForms).toEqual([updated]);
      expect(mockLoadPinnedForms).toHaveBeenCalledTimes(1);
    });
  });
});
