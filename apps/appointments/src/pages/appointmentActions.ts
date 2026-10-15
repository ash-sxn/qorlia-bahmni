export type TransitionConfig = {
  config: {
    allowedActions: string[];
    allowedActionsByStatus: Record<string, string[]>;
    enableResetAppointmentStatuses?: string[];
  };
};

export const getAllowedTransitions = (
  config: TransitionConfig | undefined,
  status: string,
) =>
  config?.config.allowedActionsByStatus[status]?.filter((action) =>
    config.config.allowedActions.includes(action),
  ) ?? [];

export const hasAppointmentConflicts = (conflicts: unknown): boolean =>
  !conflicts ||
  typeof conflicts !== 'object' ||
  Array.isArray(conflicts) ||
  Object.values(conflicts).some(
    (items) => !Array.isArray(items) || items.length > 0,
  );

export const canResetAppointmentStatus = (
  config: TransitionConfig | undefined,
  status: string,
) =>
  status !== 'Scheduled' &&
  (config?.config.enableResetAppointmentStatuses?.includes(status) ?? false);
