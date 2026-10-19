"""
OpenAPI/request body examples for datawarehouse API documentation.
Used in router Body(..., example=...) for Swagger/ReDoc.
"""

IUS_UPSERT_BODY_EXAMPLE = {
    "data": [
        {
            "i_gid": "INDICATOR_GID",
            "u_gid": ["N", "P"],
            "u_sg_gid": {
                "N": {
                    "sg_gid": ["SECONDARY-ALLMANAGEMENT-RURAL", "SECONDARY-ALLMANAGEMENT-TOTAL", "SECONDARY-ALLMANAGEMENT-URBAN"],
                    "default_sg_gids": ["SECONDARY-ALLMANAGEMENT-TOTAL"],
                },
                "P": {
                    "sg_gid": ["SECONDARY-ALLMANAGEMENT-RURAL", "SECONDARY-ALLMANAGEMENT-TOTAL", "SECONDARY-ALLMANAGEMENT-URBAN"],
                    "default_sg_gids": ["SECONDARY-ALLMANAGEMENT-TOTAL"],
                },
            },
        }
    ]
}
