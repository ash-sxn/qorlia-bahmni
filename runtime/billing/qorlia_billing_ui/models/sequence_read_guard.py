# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
from contextlib import contextmanager

from odoo import api, models
from odoo.exceptions import UserError


_MARKER = '_qorlia_inventory_read_sequence_boundary'
_TOKEN, _MISSING = object(), object()


@contextmanager
def _read_sequence_boundary(cr):
    previous = getattr(cr, _MARKER, _MISSING)
    setattr(cr, _MARKER, _TOKEN)
    try:
        yield
    finally:
        if previous is _MISSING:
            if hasattr(cr, _MARKER):
                delattr(cr, _MARKER)
        else:
            setattr(cr, _MARKER, previous)


def _check_sequence_read_boundary(cr):
    # The cursor marker survives sudo/context changes; JSON context cannot disable it.
    # shortcut: native ORM paths only; complete sequence isolation before enabling creation-effect previews.
    if getattr(cr, _MARKER, None) is _TOKEN:
        raise UserError('A read-only inventory form tried to allocate or change a document number. Nothing was saved.')


class IrSequenceReadGuard(models.Model):
    _inherit = 'ir.sequence'

    def _next(self, sequence_date=None):
        _check_sequence_read_boundary(self.env.cr)
        return super()._next(sequence_date=sequence_date)

    def _next_do(self):
        _check_sequence_read_boundary(self.env.cr)
        return super()._next_do()

    @api.model_create_multi
    def create(self, vals_list):
        _check_sequence_read_boundary(self.env.cr)
        return super().create(vals_list)

    def write(self, values):
        _check_sequence_read_boundary(self.env.cr)
        return super().write(values)

    def unlink(self):
        _check_sequence_read_boundary(self.env.cr)
        return super().unlink()


class IrSequenceDateRangeReadGuard(models.Model):
    _inherit = 'ir.sequence.date_range'

    def _next(self):
        _check_sequence_read_boundary(self.env.cr)
        return super()._next()

    def _alter_sequence(self, number_increment=None, number_next=None):
        _check_sequence_read_boundary(self.env.cr)
        return super()._alter_sequence(number_increment=number_increment, number_next=number_next)

    @api.model_create_multi
    def create(self, vals_list):
        _check_sequence_read_boundary(self.env.cr)
        return super().create(vals_list)

    def write(self, values):
        _check_sequence_read_boundary(self.env.cr)
        return super().write(values)

    def unlink(self):
        _check_sequence_read_boundary(self.env.cr)
        return super().unlink()
