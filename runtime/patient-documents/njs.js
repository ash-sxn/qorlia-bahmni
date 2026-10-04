/*
 * This Source Code Form is subject to the terms of the Mozilla Public License,
 * v. 2.0. If a copy of the MPL was not distributed with this file, You can
 * obtain one at https://www.bahmni.org/license/mplv2hd.
 *
 * Copyright 2026.
 * Based on Bahmni/patient-documents package/docker/njs.js at
 * dc20e7d2c161e26e10339b7e125bf48b0f31755b.
 * Qorlia changes: validate file paths, encode redirects and fail closed.
 */

function getRequestedDocumentPath(request) {
  let path = request.args.requested_document;
  if (typeof path !== 'string') return '';
  try {
    for (let i = 0; i < 3 && path.includes('%'); i++)
      path = decodeURIComponent(path);
  } catch (error) {
    return '';
  }
  if (
    !/^\/(document_images|uploaded_results|uploaded-files)\//.test(path) ||
    /[:?#\\%\u0000-\u001f\u007f]/.test(path) ||
    path
      .slice(1)
      .split('/')
      .some((part) => !part || part === '.' || part === '..')
  )
    return '';
  return path;
}

function auth(request) {
  const documentPath = getRequestedDocumentPath(request);
  if (!documentPath) return request.return(400);
  request.subrequest('/openmrs/session/verify', { method: 'GET' }, (res) => {
    if (res.status !== 200)
      return request.return(res.status === 401 ? 401 : 502);
    let session;
    try {
      session = JSON.parse(res.responseText);
    } catch (error) {
      return request.return(502);
    }
    const privileges = session && session.user && session.user.privileges;
    if (
      !session ||
      !session.authenticated ||
      !Array.isArray(privileges) ||
      !privileges.some(
        (privilege) =>
          privilege &&
          [
            'app:clinical',
            'app:patient-documents',
            'app:document-upload',
          ].includes(privilege.name),
      )
    )
      return request.return(403);
    request.internalRedirect(
      `/document/fetch?requested_document=${encodeURIComponent(documentPath)}`,
    );
  });
}

export default { getRequestedDocumentPath, auth };
