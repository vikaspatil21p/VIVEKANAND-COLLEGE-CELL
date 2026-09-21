# Java backend

This folder now contains a Spring Boot replacement for the Express backend.

## Requirements

- Java 17 or newer
- Apache Maven
- MySQL running with the existing `college_placement` database and tables

The Java server reads `DB_HOST`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME` from `server/.env` and listens on port `5000`.

## Run

From this `server` directory:

```powershell
mvn spring-boot:run
```

Or build and run the jar:

```powershell
mvn clean package
java -jar target/college-placement-server-1.0.0.jar
```

The existing frontend remains available at:

```text
http://localhost:5000/
```

The Java controller keeps the existing `/api` routes for authentication, students, companies, placement drives, and notifications, so the HTML frontend does not need URL changes.

The old Node backend is retained as `node-server-legacy.js` as a rollback option until the Java server has been tested against the local database.
