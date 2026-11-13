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
) => {
  const statuses = config?.config.enableResetAppointmentStatuses;
  return (
    status !== 'Scheduled' &&
    Array.isArray(statuses) &&
    statuses.includes(status)
  );
};
