import { BAHMNI_HOME_PATH } from '@bahmni/services';
import {
  HeaderContainer,
  HeaderMenuButton,
  Header as CarbonHeader,
  HeaderName,
  HeaderGlobalBar,
  HeaderGlobalAction,
  SideNav,
  SideNavItems,
  SideNavLink,
  Breadcrumb,
  BreadcrumbItem,
} from '@carbon/react';
import React from 'react';
import { Icon, ICON_SIZE } from '../../molecules/icon';
import { getHospitalBranding } from '../../utils/branding';
import { HeaderProps } from './models';
import styles from './styles/Header.module.scss';
import { useHeaderSideNav } from './useHeaderSideNav';
import { isMobile } from './utils';

/**
 * Header component combines a header with side navigation, breadcrumbs, and global actions.
 * It provides a consistent navigation experience for the application.
 *
 * @component
 * @param {HeaderProps} props - The component props
 * @returns {React.ReactElement} The rendered component
 */
export const Header: React.FC<HeaderProps> = React.memo(
  ({
    brandName: suppliedBrandName,
    brandPrefix,
    brandHref = BAHMNI_HOME_PATH,
    breadcrumbItems = [],
    globalActions = [],
    globalFeatures = [],
    sideNavItems = [],
    activeSideNavItemId = null,
    onSideNavItemClick = () => {},
    isRail = false,
    ariaLabel = 'Header',
    extraContent,
    userMenu,
  }) => {
    const hospitalBranding = getHospitalBranding();
    const brandName = suppliedBrandName ?? hospitalBranding.name;
    const { isSideNavExpanded, handleSideNavItemClick } =
      useHeaderSideNav(onSideNavItemClick);

    const renderBrand = () => {
      if (!brandName && !brandPrefix) return null;

      return (
        <HeaderName
          href={brandHref}
          prefix={brandPrefix ?? ''}
          className={
            brandName === hospitalBranding.name ? styles.qorliaBrand : undefined
          }
          data-testid="header-name"
        >
          {brandName === hospitalBranding.name &&
            (hospitalBranding.logoPath ? (
              <img
                className={styles.brandLogo}
                src={hospitalBranding.logoPath}
                alt=""
              />
            ) : (
              <span className={styles.qorliaMark} aria-hidden="true" />
            ))}
          <span>{brandName}</span>
          {brandName === hospitalBranding.name && (
            <span className={styles.brandCredit}>Built on Bahmni</span>
          )}
        </HeaderName>
      );
    };

    const renderBreadcrumbs = () => {
      if (breadcrumbItems.length === 0) return null;

      return (
        <Breadcrumb
          noTrailingSlash
          data-testid="breadcrumb"
          className={styles.breadcrumb}
        >
          {breadcrumbItems.map((item) => (
            <BreadcrumbItem
              key={item.id}
              href={item.href}
              isCurrentPage={item.isCurrentPage}
            >
              {item.label}
            </BreadcrumbItem>
          ))}
        </Breadcrumb>
      );
    };

    const renderGlobalBar = () => {
      if (
        globalActions.length === 0 &&
        !userMenu &&
        globalFeatures.length === 0
      )
        return null;

      return (
        <HeaderGlobalBar data-testid="header-global-bar">
          {globalFeatures}
          {globalActions.map((action) => (
            <HeaderGlobalAction
              key={action.id}
              aria-label={action.label}
              onClick={action.onClick}
              tooltipAlignment="end"
              data-testid={`global-action-${action.id}`}
            >
              {action.renderIcon}
            </HeaderGlobalAction>
          ))}
          {userMenu}
        </HeaderGlobalBar>
      );
    };

    const renderSideNav = (
      isMenuExpanded: boolean,
      onClickSideNavExpand: () => void,
    ) => {
      if (sideNavItems.length === 0) return null;
      const mobile = isMobile();
      const closeMobileMenu = () => {
        if (mobile && isMenuExpanded) onClickSideNavExpand();
      };

      return (
        <SideNav
          id="qorlia-side-navigation"
          aria-label={'SIDE_NAVIGATION'}
          expanded={mobile ? isMenuExpanded : isSideNavExpanded && !isRail}
          isPersistent
          isRail={isRail && !mobile}
          onOverlayClick={closeMobileMenu}
          onSideNavBlur={closeMobileMenu}
          data-testid="side-nav"
          className={styles.sideNavItems}
        >
          <SideNavItems>
            {sideNavItems.map((item) => (
              <SideNavLink
                key={item.id}
                renderIcon={() => (
                  <Icon
                    name={item.icon}
                    id={`sidebar-icon-${item.id}`}
                    size={ICON_SIZE.LG}
                    fixedWidth
                  />
                )}
                href={item.href ?? '#'}
                onClick={(e) => {
                  handleSideNavItemClick(e, item.id);
                  closeMobileMenu();
                }}
                isActive={item.id === activeSideNavItemId}
                data-testid={`sidenav-item-${item.id}`}
                large
              >
                {item.label}
              </SideNavLink>
            ))}
          </SideNavItems>
        </SideNav>
      );
    };

    return (
      <HeaderContainer
        render={({
          isSideNavExpanded: isMenuExpanded,
          onClickSideNavExpand,
        }) => (
          <CarbonHeader aria-label={ariaLabel} data-testid="header">
            {sideNavItems.length > 0 && (
              <HeaderMenuButton
                aria-label={
                  isMenuExpanded ? 'Close navigation' : 'Open navigation'
                }
                aria-expanded={isMenuExpanded}
                aria-controls="qorlia-side-navigation"
                isActive={isMenuExpanded}
                onClick={onClickSideNavExpand}
              />
            )}
            {renderBrand()}
            {renderBreadcrumbs()}
            {renderGlobalBar()}
            {renderSideNav(isMenuExpanded, onClickSideNavExpand)}
            {extraContent}
          </CarbonHeader>
        )}
      />
    );
  },
);

Header.displayName = 'Header';
export default Header;
