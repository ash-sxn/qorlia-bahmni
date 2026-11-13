# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
from odoo.addons.qorlia_billing_ui.hooks import post_init_hook


def migrate(cr, version):
    post_init_hook(cr, None)
