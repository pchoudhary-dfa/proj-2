<?php
namespace Drupal\rest_api\Service;

use Drupal\Component\Utility\UrlHelper;
use Drupal\Core\Url;
use GuzzleHttp\ClientInterface;
use Symfony\Component\HttpFoundation\RedirectResponse;
use Symfony\Component\Serializer\Serializer;
use Symfony\Component\Serializer\Encoder\JsonEncoder;
use Symfony\Component\Serializer\Normalizer\GetSetMethodNormalizer;

interface RestApiInterface
{

}