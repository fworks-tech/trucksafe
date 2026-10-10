"""
Root URL configuration for the TruckSafe API.

This module defines the URL patterns exposed by the Django project.
Application-specific URLs should be included here as new modules are added.
"""

from django.contrib import admin
from django.urls import path

urlpatterns = [
    path("admin/", admin.site.urls),
]
