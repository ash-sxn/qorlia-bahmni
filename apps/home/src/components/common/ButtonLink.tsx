import { Button, type ButtonProps } from '@bahmni/design-system';
import React, { ComponentType } from 'react';
import { Link } from 'react-router-dom';

type ButtonLinkProps = Omit<ButtonProps, 'href' | 'as'> & {
  /** An address inside the new interface, such as `/home/records`. */
  to: string;
};

/**
 * Looks like a button because it is the main way forward, and is a link because it
 * opens another page (so it can open in a new tab and the address is visible).
 */
export const ButtonLink: React.FC<ButtonLinkProps> = ({ to, ...props }) => (
  <Button
    {...(props as ButtonProps)}
    {...({ as: Link as ComponentType<unknown>, to } as Record<string, unknown>)}
  />
);

export default ButtonLink;
