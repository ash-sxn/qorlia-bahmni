# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
from contextlib import contextmanager

from odoo import api, models
from odoo.exceptions import UserError


_MARKER = '_qorlia_inventory_read_sequence_boundary'
_TOKEN, _MISSING = object(), object()
_PREVIEW_MARKER = '_qorlia_inventory_sequence_preview'
_RANGE_MARKER = '_qorlia_inventory_sequence_range_creation'
_PREVIEW_TOKEN, _RANGE_TOKEN = object(), object()


def _new_range_scope(cr):
    scope = getattr(cr, _RANGE_MARKER, None)
    return scope if (isinstance(scope, tuple) and len(scope) == 3 and scope[0] is _RANGE_TOKEN
        and type(scope[1]) is int and isinstance(scope[2], frozenset)) else None


def _new_range_records(records):
    scope = _new_range_scope(records.env.cr)
    if not scope or any(record.id in scope[2] or record.sequence_id.id != scope[1] for record in records):
        return False
    for record in records:
        records.env.cr.execute('SELECT to_regclass(%s) IS NULL', ['ir_sequence_%03d_%03d' % (scope[1], record.id)])
        if not records.env.cr.fetchone()[0]:
            return False
    return True


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


def _check_sequence_read_boundary(cr, *, allocation=False, range_creation=False):
    # The cursor marker survives sudo/context changes; JSON context cannot disable it.
    # shortcut: native ORM paths only; complete sequence isolation before enabling creation-effect previews.
    preview = getattr(cr, _PREVIEW_MARKER, None) is _PREVIEW_TOKEN
    allowed = allocation or range_creation and _new_range_scope(cr) is not None
    if getattr(cr, _MARKER, None) is _TOKEN or preview and not allowed:
        raise UserError('A read-only inventory form tried to allocate or change a document number. Nothing was saved.')


class IrSequenceReadGuard(models.Model):
    _inherit = 'ir.sequence'

    def _next(self, sequence_date=None):
        _check_sequence_read_boundary(self.env.cr, allocation=True)
        return super()._next(sequence_date=sequence_date)

    def _next_do(self):
        _check_sequence_read_boundary(self.env.cr, allocation=True)
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
        _check_sequence_read_boundary(self.env.cr, allocation=True)
        return super()._next()

    def _alter_sequence(self, number_increment=None, number_next=None):
        allowed = number_increment is None and number_next is not None and _new_range_records(self)
        _check_sequence_read_boundary(self.env.cr, range_creation=allowed)
        return super()._alter_sequence(number_increment=number_increment, number_next=number_next)

    @api.model_create_multi
    def create(self, vals_list):
        scope = _new_range_scope(self.env.cr)
        allowed = bool(scope and all(values.get('sequence_id') == scope[1] for values in vals_list))
        _check_sequence_read_boundary(self.env.cr, range_creation=allowed)
        return super().create(vals_list)

    def write(self, values):
        # Native create initialises its inverse before creating the new physical sequence.
        allowed = set(values) == {'number_next'} and _new_range_records(self)
        _check_sequence_read_boundary(self.env.cr, range_creation=allowed)
        return super().write(values)

    def unlink(self):
        _check_sequence_read_boundary(self.env.cr)
        return super().unlink()
