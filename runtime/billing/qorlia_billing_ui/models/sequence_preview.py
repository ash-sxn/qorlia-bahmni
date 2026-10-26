# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
from contextlib import closing, contextmanager
import uuid

from psycopg2 import sql
from odoo import models, tools
from odoo.addons.base.models.ir_sequence import _predict_nextval, _select_nextval
from odoo.exceptions import UserError

from .sequence_read_guard import (
    _check_sequence_read_boundary, _MISSING, _PREVIEW_MARKER, _PREVIEW_TOKEN,
    _RANGE_MARKER, _RANGE_TOKEN,
)


_STATE = '_qorlia_inventory_sequence_preview_state'


class _SequencePreview:
    def __init__(self, cr):
        self.cr, self.counters = cr, {}

    def counter(self, sequence):
        native_id = ('%03d_%03d' % (sequence.sequence_id.id, sequence.id)
            if sequence._name == 'ir.sequence.date_range' else '%03d' % sequence.id)
        if native_id not in self.counters:
            name = 'ir_sequence_' + native_id
            cr = self.cr
            cr.execute('SELECT seqtypid::regtype::text,seqincrement,seqmin,seqmax,seqcache,seqcycle '
                'FROM pg_sequence WHERE seqrelid=to_regclass(%s)', [name])
            properties = cr.fetchone()
            if not properties or properties[0] not in ('smallint', 'integer', 'bigint') or properties[4] != 1:
                raise UserError('This native sequence requires an additional safe preview adapter. Nothing was saved.')
            kind, increment, minimum, maximum, _cache, cycle = properties
            cr.execute(sql.SQL('SELECT last_value,is_called FROM {}').format(sql.Identifier(name)))
            last_value, called = cr.fetchone()
            private_id = 'qorliapreview_' + uuid.uuid4().hex
            private_name = 'ir_sequence_' + private_id
            cr.execute(sql.SQL('CREATE TEMP SEQUENCE {} AS {} INCREMENT BY %s MINVALUE %s '
                'MAXVALUE %s START WITH %s CACHE 1 {}').format(sql.Identifier(private_name), sql.SQL(kind),
                    sql.SQL('CYCLE' if cycle else 'NO CYCLE')), [increment, minimum, maximum, last_value])
            # Only the new private counter is initialised; never alter/reset a native reference counter.
            cr.execute('SELECT setval(%s,%s,%s)', [private_name, last_value, called])
            self.counters[native_id] = private_id
        return self.counters[native_id]


def _preview_for(cr):
    state = getattr(cr, _STATE, None)
    return state if getattr(cr, _PREVIEW_MARKER, None) is _PREVIEW_TOKEN and isinstance(state, _SequencePreview) else None


@contextmanager
def _preview_sequence_boundary(env):
    cr = env.cr
    _check_sequence_read_boundary(cr)
    cr.flush()
    previous = {name: getattr(cr, name, _MISSING) for name in (_STATE, _PREVIEW_MARKER, _RANGE_MARKER)}
    callbacks = {name: getattr(cr, name) for name in ('precommit', 'postcommit', 'prerollback', 'postrollback')}
    try:
        with closing(cr.savepoint()):
            for name in callbacks:
                setattr(cr, name, tools.Callbacks())
            setattr(cr, _STATE, _SequencePreview(cr))
            setattr(cr, _PREVIEW_MARKER, _PREVIEW_TOKEN)
            yield getattr(cr, _STATE)
            env.flush_all()
    finally:
        for name, original in {**previous, **callbacks}.items():
            if original is _MISSING:
                if hasattr(cr, name):
                    delattr(cr, name)
            else:
                setattr(cr, name, original)
        env.invalidate_all()


class IrSequencePreview(models.Model):
    _inherit = 'ir.sequence'

    def _next_do(self):
        _check_sequence_read_boundary(self.env.cr, allocation=True)
        preview = _preview_for(self.env.cr)
        if preview and self.implementation == 'standard':
            return self.get_next_char(_select_nextval(self.env.cr, 'ir_sequence_' + preview.counter(self)))
        return super()._next_do()

    def _get_number_next_actual(self):
        preview = _preview_for(self.env.cr)
        if not preview:
            return super()._get_number_next_actual()
        for sequence in self:
            if sequence.id and sequence.implementation == 'standard':
                sequence.number_next_actual = _predict_nextval(sequence, preview.counter(sequence))
            else:
                super(IrSequencePreview, sequence)._get_number_next_actual()

    def _create_date_range_seq(self, date):
        cr = self.env.cr
        if not _preview_for(cr):
            return super()._create_date_range_seq(date)
        previous = getattr(cr, _RANGE_MARKER, _MISSING)
        try:
            self.ensure_one()
            cr.execute('SELECT id FROM ir_sequence_date_range WHERE sequence_id=%s', [self.id])
            setattr(cr, _RANGE_MARKER, (_RANGE_TOKEN, self.id, frozenset(row[0] for row in cr.fetchall())))
            return super()._create_date_range_seq(date)
        finally:
            if previous is _MISSING:
                delattr(cr, _RANGE_MARKER)
            else:
                setattr(cr, _RANGE_MARKER, previous)


class IrSequenceDateRangePreview(models.Model):
    _inherit = 'ir.sequence.date_range'

    def _next(self):
        _check_sequence_read_boundary(self.env.cr, allocation=True)
        preview = _preview_for(self.env.cr)
        if preview and self.sequence_id.implementation == 'standard':
            return self.sequence_id.get_next_char(_select_nextval(self.env.cr, 'ir_sequence_' + preview.counter(self)))
        return super()._next()

    def _get_number_next_actual(self):
        preview = _preview_for(self.env.cr)
        if not preview:
            return super()._get_number_next_actual()
        for sequence in self:
            if sequence.sequence_id.implementation == 'standard':
                sequence.number_next_actual = _predict_nextval(sequence, preview.counter(sequence))
            else:
                super(IrSequenceDateRangePreview, sequence)._get_number_next_actual()
