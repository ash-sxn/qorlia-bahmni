import { getFormattedError, ObservationForm } from '@bahmni/services';
import {
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useCallback } from 'react';
import {
  loadPinnedForms,
  savePinnedForms,
} from '../services/pinnedFormsService';

interface UsePinnedObservationFormsOptions {
  /** User UUID required for loading and saving pinned forms */
  userUuid?: string | null;
  /** Whether available forms are currently loading */
  isFormsLoading?: boolean;
}
export function usePinnedObservationForms(
  availableForms: ObservationForm[],
  options?: UsePinnedObservationFormsOptions,
) {
  const { userUuid, isFormsLoading = false } = options ?? {};
  const queryClient = useQueryClient();
  const queryKey = ['pinnedObservationForms', userUuid];
  const mutationKey = ['savePinnedObservationForms', userUuid];
  const preferences = useQuery({
    queryKey,
    queryFn: () => loadPinnedForms(userUuid!),
    enabled: !!userUuid && !isFormsLoading,
    staleTime: Infinity,
  });
  const isSaving = useIsMutating({ mutationKey, exact: true }) > 0;
  const save = useMutation({
    mutationKey,
    retry: false,
    mutationFn: ({ user, names }: { user: string; names: string[] }) =>
      savePinnedForms(user, names),
    onMutate: ({ user }) =>
      queryClient.cancelQueries({
        queryKey: ['pinnedObservationForms', user],
        exact: true,
      }),
    onSuccess: (_result, { user, names }) => {
      queryClient.setQueryData(['pinnedObservationForms', user], names);
    },
    onError: (_error, { user }) => {
      // A lost response may follow an accepted POST. Reconcile with a GET,
      // never replay the write or publish an unconfirmed optimistic preference.
      void queryClient.invalidateQueries({
        queryKey: ['pinnedObservationForms', user],
        exact: true,
      });
    },
  });
  const readError = preferences.error;
  const saveError = save.variables?.user === userUuid ? save.error : null;
  const error = readError ?? saveError;

  const updatePinnedForms = async (newPinnedForms: ObservationForm[]) => {
    const storedNames = queryClient.getQueryData<string[]>(queryKey);
    if (
      !userUuid ||
      isFormsLoading ||
      preferences.isFetching ||
      error ||
      !storedNames ||
      queryClient.isMutating({ mutationKey, exact: true }) > 0
    )
      return;

    // Forms hidden by programme/privilege filtering are not unpinned by a
    // change to this view. Resolve visible pins from the latest catalogue.
    const visibleNames = new Set(availableForms.map((form) => form.name));
    const names = [
      ...new Set([
        ...storedNames.filter((name) => !visibleNames.has(name)),
        ...newPinnedForms
          .filter((form) =>
            availableForms.some(
              (available) =>
                available.uuid === form.uuid && available.name === form.name,
            ),
          )
          .map((form) => form.name),
      ]),
    ];
    try {
      await save.mutateAsync({ user: userUuid, names });
    } catch {
      // The hook exposes the failure; event handlers must not reject unhandled.
    }
  };

  const resetSave = save.reset;
  const retryRead = preferences.refetch;
  const refetch = useCallback(async () => {
    if (
      !userUuid ||
      isFormsLoading ||
      queryClient.isMutating({
        mutationKey: ['savePinnedObservationForms', userUuid],
        exact: true,
      }) > 0
    )
      return;
    resetSave();
    await retryRead();
  }, [userUuid, isFormsLoading, queryClient, resetSave, retryRead]);

  return {
    pinnedForms: userUuid
      ? availableForms.filter((form) => preferences.data?.includes(form.name))
      : [],
    updatePinnedForms,
    isLoading:
      isFormsLoading ||
      (!!userUuid &&
        (preferences.isPending || preferences.isFetching || isSaving)),
    error: error ? getFormattedError(error) : null,
    refetch,
  };
}
