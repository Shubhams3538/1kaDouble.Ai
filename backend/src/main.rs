use axum::{Json, Router, routing::get};
use serde::Serialize;

#[derive(Serialize)]
struct HealthResponse {
    status: &'static str,
    service: &'static str,
}

async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok",
        service: "1kadouble-backend",
    })
}

#[tokio::main]
async fn main() {
    let app = Router::new().route("/health", get(health));

    let listener = tokio::net::TcpListener::bind("127.0.0.1:3001")
        .await
        .expect("Could not bind to port 3001");

    println!("Server running at http://127.0.0.1:3001");

    axum::serve(listener, app).await.expect("Server failed");
}
