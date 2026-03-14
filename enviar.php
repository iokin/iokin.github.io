<?php

if ($_SERVER["REQUEST_METHOD"] == "POST") {

    // --- VALIDAR RECAPTCHA ---
    $secretKey = "TU_SECRET_KEY_AQUI";
    $captcha = $_POST['g-recaptcha-response'];

    if (!$captcha) {
        die("Por favor, verifica el reCAPTCHA.");
    }

    $url = "https://www.google.com/recaptcha/api/siteverify?secret=$secretKey&response=$captcha";
    $response = file_get_contents($url);
    $responseKeys = json_decode($response, true);

    if(!$responseKeys["success"]) {
        die("Error de verificación reCAPTCHA. Inténtalo de nuevo.");
    }

    // --- SI TODO OK, SE ENVÍA EL FORMULARIO ---
    $destino = "ezutik@gmail.com";

    $nombre = $_POST["nombre"];
    $fecha = $_POST["fecha_nacimiento"];
    $curso = $_POST["curso"];
    $tutor = $_POST["tutor"];
    $telefono = $_POST["telefono"];
    $email = $_POST["email"];
    $motivos = $_POST["motivos"];

    $mensaje = "
    Nueva solicitud de inscripción:

    Niño/a: $nombre
    Fecha de nacimiento: $fecha
    Curso: $curso
    Tutor/a: $tutor
    Teléfono: $telefono
    Email: $email

    Motivos:
    $motivos
    ";

    mail($destino, "Nueva inscripción a la asociación", $mensaje);

    header("Location: gracias.html");
    exit();
}
?>
