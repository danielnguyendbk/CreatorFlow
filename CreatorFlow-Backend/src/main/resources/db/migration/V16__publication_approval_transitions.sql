create function publication_approval_transition() returns trigger language plpgsql as $$
begin
    if (new.id,new.manifest_id,new.fingerprint,new.required_operator,new.issued_at) is distinct from
       (old.id,old.manifest_id,old.fingerprint,old.required_operator,old.issued_at) or new.expires_at>old.expires_at then
        raise exception 'Immutable approval binding' using errcode='23514';
    end if;
    if old.decision_request_id is not null and (new.decision_request_id,new.decision,new.decision_actor,new.decision_at) is distinct from
        (old.decision_request_id,old.decision,old.decision_actor,old.decision_at) then
        raise exception 'Immutable approval decision' using errcode='23514';
    end if;
    if new.state<>old.state and not
       (old.state='PENDING' and new.state in ('APPROVED','REJECTED','EXPIRED','INVALIDATED') or
        old.state='APPROVED' and new.state in ('REVOKED','EXPIRED','INVALIDATED')) then
        raise exception 'Terminal approval decision' using errcode='23514';
    end if;
    if new.state in ('APPROVED','REJECTED') and (new.decision_request_id is null or new.decision_at is null or
        new.decision_actor is distinct from new.required_operator or new.decision is distinct from
        case when new.state='APPROVED' then 'APPROVE' else 'REJECT' end) then
        raise exception 'Operator decision required' using errcode='23514';
    end if;
    return new;
end $$;
create trigger publication_approval_transition before update on publication_approvals for each row execute function publication_approval_transition();
create trigger immutable_publication_approval_delete before delete on publication_approvals for each row execute function immutable_publication_record();
