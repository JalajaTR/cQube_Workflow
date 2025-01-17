import { Component, OnInit } from '@angular/core';
import { UsersService } from '../../../services/users.service';
import { Router } from '@angular/router';
import { NgForm } from '@angular/forms';
import { KeycloakSecurityService } from '../../../keycloak-security.service';
import { environment } from 'src/environments/environment';
declare const $;

@Component({
  selector: 'app-change-password',
  templateUrl: './change-password.component.html',
  styleUrls: ['./change-password.component.css']
})
export class ChangePasswordComponent implements OnInit {
  public changePasswdData: any = {};
  public err;
  public successMsg;
  public isDisabled;

  constructor(public service: UsersService, public router: Router, public keycloakService: KeycloakSecurityService) {
    this.changePasswdData['userName'] = localStorage.getItem('userName');
  }

  ngOnInit() {
    document.getElementById('backBtn').style.display = "none";
    document.getElementById('homeBtn').style.display = "Block";
  }

  onSubmit(formData: NgForm) {
    document.getElementById('spinner').style.display = 'block';
    this.isDisabled = false;
    if (this.changePasswdData.userName === localStorage.getItem('userName')) {
      if (this.changePasswdData.newPasswd != this.changePasswdData.cnfpass) {
        this.err = "Password not matched";
        document.getElementById('spinner').style.display = 'none';
      } else {
        this.service.changePassword(this.changePasswdData, localStorage.getItem('user_id')).subscribe(res => {
          document.getElementById('success').style.display = "Block";
          this.err = '';
          this.successMsg = res['msg'] + "\n" + " please login again...";
          document.getElementById('spinner').style.display = 'none';
          this.isDisabled = true;
          formData.resetForm();
          setTimeout(() => {
            localStorage.clear();
            let options = {
              redirectUri: environment.appUrl
            }
            this.keycloakService.kc.logout(options);
          }, 2000);
        }, err => {
          this.err = "Something went wrong"
          document.getElementById('spinner').style.display = 'none';
        })
      }
    } else {
      this.err = "Invalid User";
      document.getElementById('spinner').style.display = 'none';
    }
  }

}
