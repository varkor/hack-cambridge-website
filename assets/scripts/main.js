var $ = require('jquery');

$(document).ready(function () {
  $('.subscribe-form').each(function () {
    var $this = $(this);
    var action = $this.attr('action');
    var method = $this.attr('method');
    var $submit = $this.find('.subscribe-form-submit');
    var submitText = $submit.text();
    var loading = null;

    var createFlash = function (text, clazz) {
      return $('<p class="subscribe-form-output"></p>')
        .text(text)
        .addClass(clazz)
        .appendTo($this)
        .hide()
        .slideDown();
    };

    $this.submit(function (e) {
      e.preventDefault();

      if (loading != null) {
        return;
      }

      $submit
        .prop('disabled', true)
        .text('Working...');

      $this.find('.subscribe-form-output')
        .slideUp(400, function () {
          $(this).remove();
        });

      loading = $.ajax(action, {
        method: method,
        data: $this.serialize()
      })
      .success(function (data) {
        createFlash(data.message, 'subscribe-form-success');
      })
      .fail(function (jqXHR) {
        var errormsg = ((jqXHR.responseJSON) && (jqXHR.responseJSON.error)) ? jqXHR.responseJSON.error : 'Something went wrong. Please try again.';

        createFlash(errormsg, 'subscribe-form-error');
      })
      .always(function () {
        $submit
          .text(submitText);

        setTimeout(function () {
          loading = null;
          $submit.prop('disabled', false);
        }, 3000)
      });
    });
  });
});
