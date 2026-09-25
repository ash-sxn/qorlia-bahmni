export type TransitionConfig = {
  config: {
    allowedActions: string[];
    allowedActionsByStatus: Record<string, string[]>;
  };
};

export const getAllowedTransitions = (
  config: TransitionConfig | undefined,
  status: string,
) =>
  config?.config.allowedActionsByStatus[status]?.filter((action) =>
    config.config.allowedActions.includes(action),
  ) ?? [];
