"""Role-based access control decorator for JWT-protected routes."""
from functools import wraps

from flask import jsonify
from flask_jwt_extended import get_jwt_identity, verify_jwt_in_request

from app.extensions import db
from app.models import User


def roles_required(*roles):
    """Allow access only to authenticated users whose role is in `roles`.

    Usage:
        @roles_required("manager")
        def dashboard(): ...
    """

    def wrapper(fn):
        @wraps(fn)
        def decorator(*args, **kwargs):
            verify_jwt_in_request()
            user = db_get_current_user()
            if user is None:
                return jsonify(error="User not found or deactivated"), 401
            if user.role not in roles:
                return jsonify(
                    error="You do not have permission to perform this action",
                    required_roles=list(roles),
                ), 403
            return fn(*args, **kwargs)

        return decorator

    return wrapper


def db_get_current_user():
    """Resolve the User row from the JWT `sub` claim."""
    user_id = get_jwt_identity()
    if user_id is None:
        return None
    return db.session.get(User, int(user_id))
